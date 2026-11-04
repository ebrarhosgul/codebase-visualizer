import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  encryptApiKey,
  decryptApiKey,
  encryptVideoApiKey,
  decryptVideoApiKey,
  AI_KEY_COOKIE_NAME,
  VIDEO_KEY_COOKIE_NAME,
} from "@/lib/ai/crypto";
import { CREDENTIAL_COOKIE_TTL_SECONDS } from "@/lib/security/cookie-crypto";
import { isSameOriginRequest, readJsonBody } from "@/lib/security/request";
import type { AiProviderId } from "@/lib/ai/types";

export const dynamic = "force-dynamic";

const ALLOWED_CHAT_PROVIDERS: readonly AiProviderId[] = [
  "gemini",
  "openai",
  "claude",
];

const MAX_BODY_BYTES = 4 * 1024;

const saveKeyRequestSchema = z.object({
  provider: z.string().max(32),
  apiKey: z.string().max(1024),
});

/**
 * Route handler for POST /api/ai/keys.
 * Encrypts user API key with AES-256-GCM and stores in secure HTTP-only cookie.
 * Supports chat providers (stored in cv_ai_key) and Scrimba video provider (stored in cv_ai_key_scrimba).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isSameOriginRequest(req)) {
    return NextResponse.json(
      { success: false, error: "Cross site requests are not allowed." },
      { status: 403 },
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

  const parsed = saveKeyRequestSchema.safeParse(bodyResult.value);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid request body." },
      { status: 400 },
    );
  }

  const { apiKey } = parsed.data;
  const rawProvider = parsed.data.provider.toLowerCase();

  const isVideoProvider = rawProvider === "scrimba";
  const isChatProvider = ALLOWED_CHAT_PROVIDERS.includes(
    rawProvider as AiProviderId,
  );

  if (!isVideoProvider && !isChatProvider) {
    return NextResponse.json(
      {
        success: false,
        error: `Unsupported provider "${parsed.data.provider}". Allowed: ${[
          ...ALLOWED_CHAT_PROVIDERS,
          "scrimba",
        ].join(", ")}`,
      },
      { status: 400 },
    );
  }

  const trimmedKey = apiKey.trim();
  if (trimmedKey.length === 0) {
    return NextResponse.json(
      { success: false, error: "API key cannot be empty." },
      { status: 400 },
    );
  }

  if (isVideoProvider) {
    if (!trimmedKey.startsWith("scr_live_") || trimmedKey.length < 16) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid Scrimba API key format. Keys must start with 'scr_live_' and be at least 16 characters long.",
        },
        { status: 400 },
      );
    }

    let encryptedValue: string;
    try {
      encryptedValue = encryptVideoApiKey(trimmedKey, "scrimba");
    } catch (err: unknown) {
      console.error(
        "Unable to encrypt video API key cookie:",
        err instanceof Error ? err.message : err,
      );
      return NextResponse.json(
        {
          success: false,
          error: "Secure credential storage is not configured on this server.",
        },
        { status: 500 },
      );
    }

    const response = NextResponse.json({
      success: true,
      provider: "scrimba",
    });

    response.cookies.set({
      name: VIDEO_KEY_COOKIE_NAME,
      value: encryptedValue,
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: CREDENTIAL_COOKIE_TTL_SECONDS,
    });

    return response;
  }

  const chatProvider = rawProvider as AiProviderId;
  let encryptedValue: string;
  try {
    encryptedValue = encryptApiKey(trimmedKey, chatProvider);
  } catch (err: unknown) {
    console.error(
      "Unable to encrypt API key cookie:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      {
        success: false,
        error: "Secure credential storage is not configured on this server.",
      },
      { status: 500 },
    );
  }

  const response = NextResponse.json({
    success: true,
    provider: chatProvider,
  });

  response.cookies.set({
    name: AI_KEY_COOKIE_NAME,
    value: encryptedValue,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CREDENTIAL_COOKIE_TTL_SECONDS,
  });

  return response;
}

/**
 * Route handler for DELETE /api/ai/keys.
 * Clears stored BYOK encrypted cookies. Supports ?scope=chat | video | all.
 */
export async function DELETE(req: NextRequest): Promise<NextResponse> {
  if (!isSameOriginRequest(req)) {
    return NextResponse.json(
      { success: false, error: "Cross site requests are not allowed." },
      { status: 403 },
    );
  }

  const scope = req.nextUrl.searchParams.get("scope") ?? "all";

  const response = NextResponse.json({
    success: true,
    message: `Stored credentials cleared (${scope}).`,
  });

  if (scope === "chat" || scope === "all") {
    response.cookies.set({
      name: AI_KEY_COOKIE_NAME,
      value: "",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
  }

  if (scope === "video" || scope === "all") {
    response.cookies.set({
      name: VIDEO_KEY_COOKIE_NAME,
      value: "",
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
  }

  return response;
}

/**
 * Route handler for GET /api/ai/keys.
 * Checks if BYOK encrypted cookies exist and returns status for chat and video providers.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const chatCookie = req.cookies.get(AI_KEY_COOKIE_NAME);
  const videoCookie = req.cookies.get(VIDEO_KEY_COOKIE_NAME);

  const headers = new Headers();
  headers.set("Cache-Control", "no-store, max-age=0");

  let hasKey = false;
  let provider: string | undefined = undefined;

  if (chatCookie?.value) {
    const payload = decryptApiKey(chatCookie.value);
    if (payload) {
      hasKey = true;
      provider = payload.provider;
    }
  }

  let hasVideoKey = false;
  let videoProvider: "scrimba" | undefined = undefined;

  if (videoCookie?.value) {
    const payload = decryptVideoApiKey(videoCookie.value);
    if (payload) {
      hasVideoKey = true;
      videoProvider = "scrimba";
    }
  }

  return NextResponse.json(
    {
      hasKey,
      provider,
      hasVideoKey,
      videoProvider,
    },
    { headers },
  );
}
