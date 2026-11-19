import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  encryptApiKeysMap,
  decryptApiKeysMap,
  maskApiKey,
  AI_KEY_COOKIE_NAME,
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
 * Supports multiple chat providers stored in cv_ai_key.
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

  const isChatProvider = ALLOWED_CHAT_PROVIDERS.includes(
    rawProvider as AiProviderId,
  );

  if (!isChatProvider) {
    return NextResponse.json(
      {
        success: false,
        error: `Unsupported provider "${parsed.data.provider}". Allowed: ${ALLOWED_CHAT_PROVIDERS.join(", ")}`,
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

  const chatProvider = rawProvider as AiProviderId;
  let encryptedValue: string;
  let updatedProviders: AiProviderId[] = [chatProvider];
  try {
    const existingCookie = req.cookies.get(AI_KEY_COOKIE_NAME)?.value;
    const existingPayload = existingCookie
      ? decryptApiKeysMap(existingCookie)
      : null;
    const mergedKeys: Partial<Record<AiProviderId, string>> = {
      ...(existingPayload?.keys ?? {}),
      [chatProvider]: trimmedKey,
    };
    updatedProviders = Object.keys(mergedKeys) as AiProviderId[];
    encryptedValue = encryptApiKeysMap(mergedKeys, chatProvider);
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
    configuredProviders: updatedProviders,
    maskedKey: maskApiKey(trimmedKey),
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
 * Clears all stored chat keys, or one key selected by ?provider=gemini|openai|claude.
 */
export async function DELETE(req: NextRequest): Promise<NextResponse> {
  if (!isSameOriginRequest(req)) {
    return NextResponse.json(
      { success: false, error: "Cross site requests are not allowed." },
      { status: 403 },
    );
  }

  const targetProvider = req.nextUrl.searchParams
    .get("provider")
    ?.toLowerCase();

  if (targetProvider) {
    if (ALLOWED_CHAT_PROVIDERS.includes(targetProvider as AiProviderId)) {
      const chatProvider = targetProvider as AiProviderId;
      const existingCookie = req.cookies.get(AI_KEY_COOKIE_NAME)?.value;
      let existingPayload: ReturnType<typeof decryptApiKeysMap> = null;
      try {
        existingPayload = existingCookie
          ? decryptApiKeysMap(existingCookie)
          : null;
      } catch {
        existingPayload = null;
      }

      const remainingKeys: Partial<Record<AiProviderId, string>> = {
        ...(existingPayload?.keys ?? {}),
      };
      delete remainingKeys[chatProvider];

      const remainingProviders = Object.keys(remainingKeys) as AiProviderId[];
      const response = NextResponse.json({
        success: true,
        provider: chatProvider,
        configuredProviders: remainingProviders,
        message: `Stored ${chatProvider} credentials cleared.`,
      });

      if (remainingProviders.length > 0) {
        const nextActive =
          existingPayload?.activeProvider &&
          existingPayload.activeProvider !== chatProvider &&
          remainingKeys[existingPayload.activeProvider]
            ? existingPayload.activeProvider
            : remainingProviders[0];
        try {
          const reencrypted = encryptApiKeysMap(remainingKeys, nextActive);
          response.cookies.set({
            name: AI_KEY_COOKIE_NAME,
            value: reencrypted,
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            path: "/",
            maxAge: CREDENTIAL_COOKIE_TTL_SECONDS,
          });
        } catch {
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
      } else {
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

      return response;
    }
  }

  if (targetProvider) {
    return NextResponse.json(
      { success: false, error: "Unsupported provider." },
      { status: 400 },
    );
  }
  const scope = req.nextUrl.searchParams.get("scope") ?? "all";
  if (scope !== "chat" && scope !== "all") {
    return NextResponse.json(
      { success: false, error: "Unsupported scope." },
      { status: 400 },
    );
  }

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

  return response;
}

/**
 * Route handler for GET /api/ai/keys.
 * Returns configured chat providers and masked key previews.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const chatCookie = req.cookies.get(AI_KEY_COOKIE_NAME);

  const headers = new Headers();
  headers.set("Cache-Control", "no-store, max-age=0");

  let hasKey = false;
  let provider: AiProviderId | undefined = undefined;
  let configuredProviders: AiProviderId[] = [];
  const maskedKeys: Record<string, string> = {};

  if (chatCookie?.value) {
    try {
      const payload = decryptApiKeysMap(chatCookie.value);
      if (payload) {
        configuredProviders = Object.keys(payload.keys) as AiProviderId[];
        hasKey = configuredProviders.length > 0;
        provider = payload.activeProvider;
        for (const id of configuredProviders) {
          const raw = payload.keys[id];
          if (raw) {
            maskedKeys[id] = maskApiKey(raw);
          }
        }
      }
    } catch {
      // Treat undecryptable cookie as unconfigured
    }
  }

  return NextResponse.json(
    {
      hasKey,
      provider,
      configuredProviders,
      allConfiguredProviders: configuredProviders,
      configuredKeyCount: configuredProviders.length,
      maskedKeys,
    },
    { headers },
  );
}
