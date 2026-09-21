import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  encryptApiKey,
  decryptApiKey,
  AI_KEY_COOKIE_NAME,
} from "@/lib/ai/crypto";
import { CREDENTIAL_COOKIE_TTL_SECONDS } from "@/lib/security/cookie-crypto";
import { isSameOriginRequest, readJsonBody } from "@/lib/security/request";
import type { AiProviderId } from "@/lib/ai/types";

export const dynamic = "force-dynamic";

const ALLOWED_PROVIDERS: readonly AiProviderId[] = [
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
 * Only same origin JSON requests are accepted so another site cannot plant a
 * key in the visitor's browser.
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
  const provider = parsed.data.provider as AiProviderId;

  if (!ALLOWED_PROVIDERS.includes(provider)) {
    return NextResponse.json(
      {
        success: false,
        error: `Unsupported provider "${parsed.data.provider}". Allowed: ${ALLOWED_PROVIDERS.join(
          ", ",
        )}`,
      },
      { status: 400 },
    );
  }

  if (apiKey.trim().length === 0) {
    return NextResponse.json(
      { success: false, error: "API key cannot be empty." },
      { status: 400 },
    );
  }

  let encryptedValue: string;
  try {
    encryptedValue = encryptApiKey(apiKey.trim(), provider);
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
    provider,
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
 * Clears the stored BYOK encrypted cookie.
 */
export async function DELETE(req: NextRequest): Promise<NextResponse> {
  if (!isSameOriginRequest(req)) {
    return NextResponse.json(
      { success: false, error: "Cross site requests are not allowed." },
      { status: 403 },
    );
  }

  const response = NextResponse.json({
    success: true,
    message: "Stored credentials cleared.",
  });

  response.cookies.set({
    name: AI_KEY_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return response;
}

/**
 * Route handler for GET /api/ai/keys.
 * Checks if a BYOK encrypted cookie exists and returns the provider.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const cookie = req.cookies.get(AI_KEY_COOKIE_NAME);

  const headers = new Headers();
  headers.set("Cache-Control", "no-store, max-age=0");

  if (!cookie?.value) {
    return NextResponse.json({ hasKey: false }, { headers });
  }

  const payload = decryptApiKey(cookie.value);
  if (!payload) {
    return NextResponse.json({ hasKey: false }, { headers });
  }

  return NextResponse.json(
    { hasKey: true, provider: payload.provider },
    { headers },
  );
}
