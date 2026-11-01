import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { decryptVideoApiKey, VIDEO_KEY_COOKIE_NAME } from "@/lib/ai/crypto";
import { checkVideoPollRateLimit } from "@/lib/ai/rate-limiter";
import { classifyError, sanitizeErrorMessage } from "@/lib/ai/error-classifier";
import { getClientIp } from "@/lib/security/request";
import { isAllowedVideoUri } from "@/lib/ai/video/url-validator";
import type {
  GetVideoJobStatusResponse,
  ScrimbaExplainerStatusResponse,
} from "@/lib/ai/video/types";

export const dynamic = "force-dynamic";

const jobIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{4,128}$/);

interface RouteParams {
  params: Promise<{ jobId: string }>;
}

/**
 * Route handler for GET /api/ai/video/[jobId].
 * Polls status of an ongoing Scrimba Explain walkthrough generation job.
 */
export async function GET(
  req: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { jobId } = await params;

  const parsedJobId = jobIdSchema.safeParse(jobId);
  if (!parsedJobId.success) {
    return NextResponse.json(
      { success: false, error: "Invalid jobId parameter format." },
      { status: 400 },
    );
  }

  const clientIp = getClientIp(req);
  const rateLimit = checkVideoPollRateLimit(clientIp);
  if (!rateLimit.isAllowed) {
    const retryAfter = rateLimit.retryAfterSeconds ?? 10;
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
      { success: false, error: fallbackNotice.message, fallbackNotice },
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
      { success: false, error: fallbackNotice.message, fallbackNotice },
      { status: 401 },
    );
  }

  const baseUrl = process.env.SCRIMBA_API_BASE_URL ?? "https://api.scrimba.com";

  try {
    const upstreamRes = await fetch(
      `${baseUrl}/api/v1/explainers/${encodeURIComponent(parsedJobId.data)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${decrypted.apiKey}`,
        },
      },
    );

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
        const retryAfterSeconds = retryHeader ? parseInt(retryHeader, 10) : 10;
        const fallbackNotice = classifyError({
          status: 429,
          provider: "scrimba",
          retryAfterSeconds: Number.isNaN(retryAfterSeconds)
            ? 10
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

      if (upstreamRes.status === 404) {
        return NextResponse.json(
          { success: false, error: "Walkthrough job not found." },
          { status: 404 },
        );
      }

      const fallbackNotice = classifyError({
        status: upstreamRes.status,
        provider: "scrimba",
        message: sanitized || "Upstream Scrimba poll error.",
        suggestedAction: "retry",
      });
      return NextResponse.json(
        { success: false, error: fallbackNotice.message, fallbackNotice },
        { status: 502 },
      );
    }

    const upstreamData =
      (await upstreamRes.json()) as ScrimbaExplainerStatusResponse;

    if (upstreamData.status === "complete") {
      if (!upstreamData.videoUrl || !isAllowedVideoUri(upstreamData.videoUrl)) {
        const fallbackNotice = classifyError({
          status: 502,
          provider: "scrimba",
          message: "Upstream returned an untrusted or missing video URL.",
          suggestedAction: "retry",
        });
        return NextResponse.json(
          { success: false, error: fallbackNotice.message, fallbackNotice },
          { status: 502 },
        );
      }

      const responsePayload: GetVideoJobStatusResponse = {
        jobId: upstreamData.id,
        status: "complete",
        videoUri: upstreamData.videoUrl,
        durationSeconds: upstreamData.durationSeconds ?? 30,
        upstreamScenes: upstreamData.scenes ?? [],
      };

      return NextResponse.json(responsePayload, { status: 200 });
    }

    if (upstreamData.status === "failed") {
      const errorNotice = classifyError({
        status: 500,
        provider: "scrimba",
        message: sanitizeErrorMessage(
          upstreamData.error || "Walkthrough rendering failed upstream.",
        ),
        suggestedAction: "retry",
      });

      const responsePayload: GetVideoJobStatusResponse = {
        jobId: upstreamData.id,
        status: "failed",
        videoUri: null,
        durationSeconds: upstreamData.durationSeconds ?? 30,
        errorNotice,
      };

      return NextResponse.json(responsePayload, { status: 200 });
    }

    const responsePayload: GetVideoJobStatusResponse = {
      jobId: upstreamData.id,
      status: "polling",
      videoUri: null,
      durationSeconds: upstreamData.durationSeconds ?? 30,
      upstreamScenes: upstreamData.scenes ?? [],
    };

    return NextResponse.json(responsePayload, { status: 200 });
  } catch (err: unknown) {
    const errorMsg =
      err instanceof Error ? err.message : "Failed to poll Scrimba API.";
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
