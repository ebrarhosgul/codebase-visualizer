import {
  openCookiePayload,
  requireCookieSecret,
  sealCookiePayload,
} from "@/lib/security/cookie-crypto";

export {
  GITHUB_PAT_COOKIE_NAME,
  validateGithubTokenFormat,
  maskGithubToken,
} from "./token-validation";

const COOKIE_PURPOSE = "github-pat";

/**
 * Reads the cookie encryption secret from COOKIE_ENCRYPTION_KEY, or
 * AI_COOKIE_SECRET when that is not set. Throws when neither is configured;
 * there is no development fallback.
 */
function getCookieSecret(): string {
  return requireCookieSecret(["COOKIE_ENCRYPTION_KEY", "AI_COOKIE_SECRET"]);
}

/**
 * Encrypts a GitHub personal access token using AES-256-GCM.
 * The sealed value expires after the credential cookie lifetime.
 * Output format: iv:authTag:ciphertext (all in hex).
 * Throws CookieSecretMissingError when no cookie secret is configured.
 */
export function encryptGithubToken(token: string): string {
  return sealCookiePayload(
    { token: token.trim() },
    COOKIE_PURPOSE,
    getCookieSecret(),
  );
}

/**
 * Decrypts an AES-256-GCM encrypted GitHub token.
 * Returns null if decryption fails, the format is invalid, or the value has expired.
 * Throws CookieSecretMissingError when no cookie secret is configured.
 */
export function decryptGithubToken(encryptedValue: string): string | null {
  const payload = openCookiePayload(
    encryptedValue,
    COOKIE_PURPOSE,
    getCookieSecret(),
  );
  if (!payload || typeof payload.token !== "string") {
    return null;
  }

  const token = payload.token.trim();
  return token.length > 0 ? token : null;
}
