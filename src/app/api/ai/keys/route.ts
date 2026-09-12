import { NextRequest, NextResponse } from "next/server";
import {
  encryptApiKey,
  decryptApiKey,
  AI_KEY_COOKIE_NAME,
} from "@/lib/ai/crypto";
import type { AiProviderId } from "@/lib/ai/types";

export const dynamic = "force-dynamic";

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
