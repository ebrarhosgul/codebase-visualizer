import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { decryptVideoApiKey, VIDEO_KEY_COOKIE_NAME } from "@/lib/ai/crypto";
import { checkVideoCreateRateLimit } from "@/lib/ai/rate-limiter";
import { classifyError, sanitizeErrorMessage } from "@/lib/ai/error-classifier";
import {
  getClientIp,
  isSameOriginRequest,
  readJsonBody,
} from "@/lib/security/request";
import type {
  CreateVideoJobResponse,
  ScrimbaExplainerStatusResponse,
} from "@/lib/ai/video/types";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 32 * 1024;

const createVideoRequestSchema = z.object({
  repositoryFullName: z.string().min(1).max(256),
  messageId: z.string().min(1).max(128),
  prompt: z.string().min(1).max(4096),
  answerText: z.string().min(1).max(32768),
  targetDurationSeconds: z.number().int().min(15).max(45).optional(),
  chapters: z
    .array(
      z.object({
        title: z.string().max(256),
        narration: z.string().max(4096),
        targetNodes: z.array(z.string().max(256)).max(32),
      }),
    )
    .max(16)
    .optional(),
});

/**
 * Route handler for POST /api/ai/video.
 * Initiates an asynchronous architectural video explainer job with Scrimba Explain.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isSameOriginRequest(req)) {
    return NextResponse.json(
      { success: false, error: "Cross site requests are not allowed." },
      { status: 403 },
    );
  }

  const clientIp = getClientIp(req);
  const rateLimit = checkVideoCreateRateLimit(clientIp);
  if (!rateLimit.isAllowed) {
    const retryAfter = rateLimit.retryAfterSeconds ?? 60;
    const fallbackNotice = classifyError({
      status: 429,
      provider: "scrimba",
      retryAfterSeconds: retryAfter,
      suggestedAction: "retry",
    });

    return NextResponse.json(
      {
        success: false,
        error: fallbackNotice.message,
        fallbackNotice,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
        },
      },
    );
  }

  const cookie = req.cookies.get(VIDEO_KEY_COOKIE_NAME);
  if (!cookie?.value) {
    const fallbackNotice = classifyError({
      status: 401,
      provider: "scrimba",
      suggestedAction: "open_keys",
    });
    return NextResponse.json(
      {
        success: false,
        error: fallbackNotice.message,
        fallbackNotice,
      },
      { status: 401 },
    );
  }

  const decrypted = decryptVideoApiKey(cookie.value);
  if (!decrypted?.apiKey) {
    const fallbackNotice = classifyError({
      status: 401,
      provider: "scrimba",
      suggestedAction: "open_keys",
    });
    return NextResponse.json(
      {
        success: false,
        error: fallbackNotice.message,
        fallbackNotice,
      },
      { status: 401 },
    );
  }

  const bodyResult = await readJsonBody(req, {
    maxBytes: MAX_BODY_BYTES,
    requireJsonContentType: true,
  });
  if (!bodyResult.ok) {
    return NextResponse.json(
      { success: false, error: bodyResult.message },
      { status: bodyResult.status },
    );
  }

  const parsed = createVideoRequestSchema.safeParse(bodyResult.value);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid request payload for video generation.",
      },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const baseUrl = process.env.SCRIMBA_API_BASE_URL ?? "https://api.scrimba.com";
  const durationSeconds = data.targetDurationSeconds ?? 30;

  try {
    const upstreamRes = await fetch(`${baseUrl}/api/v1/explainers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${decrypted.apiKey}`,
      },
      body: JSON.stringify({
        title: `Codebase Walkthrough: ${data.repositoryFullName}`,
        prompt: data.prompt,
        context: data.answerText,
        targetDurationSeconds: durationSeconds,
        chapters: data.chapters ?? [],
      }),
    });

    if (!upstreamRes.ok) {
      const rawBody = await upstreamRes.text();
      const sanitized = sanitizeErrorMessage(rawBody);

      if (upstreamRes.status === 401 || upstreamRes.status === 403) {
        const fallbackNotice = classifyError({
          status: upstreamRes.status,
          provider: "scrimba",
          suggestedAction: "open_keys",
          message: sanitized,
        });
        return NextResponse.json(
          { success: false, error: fallbackNotice.message, fallbackNotice },
          { status: upstreamRes.status },
        );
      }

      if (upstreamRes.status === 429) {
        const retryHeader = upstreamRes.headers.get("retry-after");
        const retryAfterSeconds = retryHeader ? parseInt(retryHeader, 10) : 60;
        const fallbackNotice = classifyError({
          status: 429,
          provider: "scrimba",
          retryAfterSeconds: Number.isNaN(retryAfterSeconds)
            ? 60
            : retryAfterSeconds,
          suggestedAction: "retry",
          message: sanitized,
        });
        return NextResponse.json(
          { success: false, error: fallbackNotice.message, fallbackNotice },
          {
            status: 429,
            headers: {
              "Retry-After": String(fallbackNotice.retryAfterSeconds),
            },
          },
        );
      }

      const fallbackNotice = classifyError({
        status: upstreamRes.status,
        provider: "scrimba",
        message: sanitized || "Upstream Scrimba service error.",
        suggestedAction: "retry",
      });
      return NextResponse.json(
        { success: false, error: fallbackNotice.message, fallbackNotice },
        { status: 502 },
      );
    }

    const upstreamData =
      (await upstreamRes.json()) as ScrimbaExplainerStatusResponse;

    const responsePayload: CreateVideoJobResponse = {
      jobId: upstreamData.id,
      status: upstreamData.status === "complete" ? "polling" : "queued",
      durationSeconds: upstreamData.durationSeconds ?? durationSeconds,
      upstreamScenes: upstreamData.scenes ?? [],
    };

    return NextResponse.json(responsePayload, { status: 202 });
  } catch (err: unknown) {
    const errorMsg =
      err instanceof Error ? err.message : "Failed to connect to Scrimba API.";
    const sanitized = sanitizeErrorMessage(errorMsg);
    const fallbackNotice = classifyError({
      status: 504,
      provider: "scrimba",
      message: sanitized,
      suggestedAction: "retry",
    });

    return NextResponse.json(
      { success: false, error: fallbackNotice.message, fallbackNotice },
      { status: 502 },
    );
  }
}
