import {
  openCookiePayload,
  requireCookieSecret,
  sealCookiePayload,
} from "@/lib/security/cookie-crypto";
import type { AiProviderId } from "@/lib/ai/types";

export const AI_KEY_COOKIE_NAME = "cv_ai_key";
export const VIDEO_KEY_COOKIE_NAME = "cv_ai_key_scrimba";

const COOKIE_PURPOSE = "ai-key";
const VIDEO_COOKIE_PURPOSE = "video-key";

const VALID_CHAT_PROVIDERS: readonly AiProviderId[] = [
  "gemini",
  "openai",
  "claude",
];

/**
 * Reads the cookie encryption secret from AI_COOKIE_SECRET.
 * Throws when it is missing; there is no development fallback.
 */
function getCookieSecret(): string {
  return requireCookieSecret(["AI_COOKIE_SECRET"]);
}

export interface EncryptedPayload {
  readonly apiKey: string;
  readonly provider: string;
}

export interface EncryptedKeysMapPayload {
  readonly keys: Readonly<Partial<Record<AiProviderId, string>>>;
  readonly activeProvider: AiProviderId;
}

/**
 * Formats an API key into a safe masked preview without exposing the secret.
 */
export function maskApiKey(rawKey: string): string {
  const trimmed = rawKey.trim();
  if (trimmed.length <= 8) {
    return "••••••••";
  }
  return `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`;
}

/**
 * Encrypts a map of chat provider API keys into an AES-256-GCM encrypted string.
 * Includes legacy `apiKey` and `provider` fields for the active provider so single key
 * readers remain compatible.
 */
export function encryptApiKeysMap(
  keys: Readonly<Partial<Record<AiProviderId, string>>>,
  activeProvider?: AiProviderId,
): string {
  const cleanKeys: Partial<Record<AiProviderId, string>> = {};
  for (const id of VALID_CHAT_PROVIDERS) {
    const val = keys[id];
    if (typeof val === "string" && val.trim().length > 0) {
      cleanKeys[id] = val.trim();
    }
  }

  const configuredIds = Object.keys(cleanKeys) as AiProviderId[];
  const resolvedProvider: AiProviderId =
    activeProvider && cleanKeys[activeProvider]
      ? activeProvider
      : (configuredIds[0] ?? "gemini");
  const resolvedKey = cleanKeys[resolvedProvider] ?? "";

  return sealCookiePayload(
    {
      keys: cleanKeys,
      activeProvider: resolvedProvider,
      apiKey: resolvedKey,
      provider: resolvedProvider,
    },
    COOKIE_PURPOSE,
    getCookieSecret(),
  );
}

/**
 * Decrypts an AES-256-GCM encrypted cookie string into a multi provider key map.
 * Supports both multi provider payloads and legacy single provider payloads.
 */
export function decryptApiKeysMap(
  encryptedValue: string,
): EncryptedKeysMapPayload | null {
  const payload = openCookiePayload(
    encryptedValue,
    COOKIE_PURPOSE,
    getCookieSecret(),
  );
  if (!payload) {
    return null;
  }

  const cleanKeys: Partial<Record<AiProviderId, string>> = {};

  if (
    typeof payload.keys === "object" &&
    payload.keys !== null &&
    !Array.isArray(payload.keys)
  ) {
    const rawMap = payload.keys as Record<string, unknown>;
    for (const id of VALID_CHAT_PROVIDERS) {
      const val = rawMap[id];
      if (typeof val === "string" && val.trim().length > 0) {
        cleanKeys[id] = val.trim();
      }
    }
  }

  if (
    Object.keys(cleanKeys).length === 0 &&
    typeof payload.apiKey === "string" &&
    typeof payload.provider === "string" &&
    payload.apiKey.trim().length > 0 &&
    VALID_CHAT_PROVIDERS.includes(payload.provider as AiProviderId)
  ) {
    cleanKeys[payload.provider as AiProviderId] = payload.apiKey.trim();
  }

  const configuredIds = Object.keys(cleanKeys) as AiProviderId[];
  if (configuredIds.length === 0) {
    return null;
  }

  const candidateActive =
    typeof payload.activeProvider === "string"
      ? payload.activeProvider
      : typeof payload.provider === "string"
        ? payload.provider
        : undefined;

  const activeProvider: AiProviderId =
    candidateActive &&
    VALID_CHAT_PROVIDERS.includes(candidateActive as AiProviderId) &&
    cleanKeys[candidateActive as AiProviderId]
      ? (candidateActive as AiProviderId)
      : configuredIds[0];

  return {
    keys: cleanKeys,
    activeProvider,
  };
}

/**
 * Encrypts an API key and provider name into an AES-256-GCM encrypted string
 * that expires after the credential cookie lifetime.
 * Format: iv:authTag:ciphertext (all in hex)
 * Throws CookieSecretMissingError when AI_COOKIE_SECRET is not configured.
 */
export function encryptApiKey(apiKey: string, provider: string): string {
  if (VALID_CHAT_PROVIDERS.includes(provider as AiProviderId)) {
    return encryptApiKeysMap(
      { [provider as AiProviderId]: apiKey },
      provider as AiProviderId,
    );
  }
  return sealCookiePayload(
    { apiKey, provider },
    COOKIE_PURPOSE,
    getCookieSecret(),
  );
}

/**
 * Decrypts an AES-256-GCM encrypted string back to API key and provider.
 * Returns null if decryption fails, the authentication tag is invalid, or the
 * value has expired.
 * Throws CookieSecretMissingError when AI_COOKIE_SECRET is not configured.
 */
export function decryptApiKey(encryptedValue: string): EncryptedPayload | null {
  const payload = openCookiePayload(
    encryptedValue,
    COOKIE_PURPOSE,
    getCookieSecret(),
  );
  if (!payload) {
    return null;
  }

  const { apiKey, provider } = payload;
  if (
    typeof apiKey !== "string" ||
    typeof provider !== "string" ||
    !apiKey ||
    !provider
  ) {
    return null;
  }

  return { apiKey, provider };
}

/**
 * Encrypts a Scrimba video API key into an AES-256-GCM encrypted string
 * with purpose "video-key".
 */
export function encryptVideoApiKey(
  apiKey: string,
  provider = "scrimba",
): string {
  return sealCookiePayload(
    { apiKey, provider },
    VIDEO_COOKIE_PURPOSE,
    getCookieSecret(),
  );
}

/**
 * Decrypts an AES-256-GCM encrypted string back to video API key and provider.
 * Returns null if decryption fails or purpose is mismatched.
 */
export function decryptVideoApiKey(
  encryptedValue: string,
): EncryptedPayload | null {
  const payload = openCookiePayload(
    encryptedValue,
    VIDEO_COOKIE_PURPOSE,
    getCookieSecret(),
  );
  if (!payload) {
    return null;
  }

  const { apiKey, provider } = payload;
  if (
    typeof apiKey !== "string" ||
    typeof provider !== "string" ||
    !apiKey ||
    !provider
  ) {
    return null;
  }

  return { apiKey, provider };
}
