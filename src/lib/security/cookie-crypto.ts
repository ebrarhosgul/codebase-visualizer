import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

/**
 * Lifetime of an encrypted credential cookie. Applied both as the cookie
 * `Max-Age` and as an expiry sealed inside the ciphertext, so a copied cookie
 * value stops working even if a client ignores the cookie attribute.
 */
export const CREDENTIAL_COOKIE_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

const AAD_PREFIX = "codebase-visualizer:cookie:v2:";

/**
 * Thrown when the server secret used to protect credential cookies is not
 * configured. There is deliberately no fallback secret: without one, cookies
 * cannot be created or read.
 */
export class CookieSecretMissingError extends Error {
  constructor(variableNames: readonly string[]) {
    super(
      `${variableNames.join(" or ")} is not set. Configure a random secret of at least 32 characters in the server environment before storing or reading credential cookies.`,
    );
    this.name = "CookieSecretMissingError";
  }
}

/**
 * Returns the first non empty secret from the named environment variables.
 * Throws CookieSecretMissingError when none is set (fail closed).
 */
export function requireCookieSecret(variableNames: readonly string[]): string {
  for (const name of variableNames) {
    const value = process.env[name];
    if (value && value.trim().length > 0) {
      return value;
    }
  }
  throw new CookieSecretMissingError(variableNames);
}

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

/**
 * Encrypts a JSON payload with AES-256-GCM.
 * The payload is stamped with an expiry, and `purpose` is bound in as
 * additional authenticated data so a ciphertext minted for one cookie cannot
 * be replayed as another.
 * Output format: iv:authTag:ciphertext (all in hex).
 */
export function sealCookiePayload(
  payload: Readonly<Record<string, unknown>>,
  purpose: string,
  secret: string,
  now: number = Date.now(),
): string {
  const iv = randomBytes(12); // 96-bit IV recommended for GCM
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret), iv);
  cipher.setAAD(Buffer.from(`${AAD_PREFIX}${purpose}`, "utf8"));

  const body = JSON.stringify({
    ...payload,
    exp: now + CREDENTIAL_COOKIE_TTL_SECONDS * 1000,
  });
  let encrypted = cipher.update(body, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Decrypts and authenticates a sealed cookie payload.
 * Returns null for anything malformed, tampered, minted for a different
 * purpose, or expired.
 */
export function openCookiePayload(
  sealed: string,
  purpose: string,
  secret: string,
  now: number = Date.now(),
): Record<string, unknown> | null {
  const key = deriveKey(secret);
  try {
    const parts = sealed.split(":");
    if (parts.length !== 3) {
      return null;
    }

    const [ivHex, authTagHex, cipherHex] = parts;
    if (!ivHex || !authTagHex || !cipherHex) {
      return null;
    }

    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(ivHex, "hex"),
    );
    decipher.setAAD(Buffer.from(`${AAD_PREFIX}${purpose}`, "utf8"));
    decipher.setAuthTag(Buffer.from(authTagHex, "hex"));

    let decrypted = decipher.update(cipherHex, "hex", "utf8");
    decrypted += decipher.final("utf8");

    const parsed: unknown = JSON.parse(decrypted);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return null;
    }

    const record = parsed as Record<string, unknown>;
    if (typeof record.exp !== "number" || record.exp <= now) {
      return null;
    }

    return record;
  } catch {
    return null;
  }
}
