import { NextRequest, NextResponse } from "next/server";
import { encryptApiKey, AI_KEY_COOKIE_NAME } from "@/lib/ai/crypto";
import type { AiProviderId } from "@/lib/ai/types";

const ALLOWED_PROVIDERS: readonly AiProviderId[] = [
  "gemini",
  "openai",
  "claude",
];

interface SaveKeyRequest {
  readonly provider: AiProviderId;
  readonly apiKey: string;
}

/**
 * Route handler for POST /api/ai/keys.
 * Encrypts user API key with AES-256-GCM and stores in secure HTTP-only cookie.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: SaveKeyRequest;
  try {
    body = (await req.json()) as SaveKeyRequest;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON request body." },
      { status: 400 },
    );
  }

  const { provider, apiKey } = body;

  if (!ALLOWED_PROVIDERS.includes(provider)) {
    return NextResponse.json(
      {
        success: false,
        error: `Unsupported provider "${provider}". Allowed: ${ALLOWED_PROVIDERS.join(
          ", ",
        )}`,
      },
      { status: 400 },
    );
  }

  if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length === 0) {
    return NextResponse.json(
      { success: false, error: "API key cannot be empty." },
      { status: 400 },
    );
  }

  const encryptedValue = encryptApiKey(apiKey.trim(), provider);

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
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  return response;
}

/**
 * Route handler for DELETE /api/ai/keys.
 * Clears the stored BYOK encrypted cookie.
 */
export async function DELETE(): Promise<NextResponse> {
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
