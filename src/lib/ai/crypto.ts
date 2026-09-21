import {
  openCookiePayload,
  requireCookieSecret,
  sealCookiePayload,
} from "@/lib/security/cookie-crypto";

export const AI_KEY_COOKIE_NAME = "cv_ai_key";

const COOKIE_PURPOSE = "ai-key";

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

/**
 * Encrypts an API key and provider name into an AES-256-GCM encrypted string
 * that expires after the credential cookie lifetime.
 * Format: iv:authTag:ciphertext (all in hex)
 * Throws CookieSecretMissingError when AI_COOKIE_SECRET is not configured.
 */
export function encryptApiKey(apiKey: string, provider: string): string {
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
