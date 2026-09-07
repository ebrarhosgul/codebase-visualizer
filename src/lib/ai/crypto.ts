import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

export const AI_KEY_COOKIE_NAME = "cv_ai_key";

/**
 * Derives a deterministic 32-byte key from environment secret or fallback development key.
 */
function getEncryptionKey(): Buffer {
  const secret =
    process.env.AI_COOKIE_SECRET ||
    "codebase-visualizer-development-secret-key-32-bytes";
  return createHash("sha256").update(secret).digest();
}

export interface EncryptedPayload {
  readonly apiKey: string;
  readonly provider: string;
}

/**
 * Encrypts an API key and provider name into an AES-256-GCM encrypted string.
 * Format: iv:authTag:ciphertext (all in hex)
 */
export function encryptApiKey(apiKey: string, provider: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12); // 96-bit IV recommended for GCM
  const cipher = createCipheriv("aes-256-gcm", key, iv);

  const payload = JSON.stringify({ apiKey, provider });
  let encrypted = cipher.update(payload, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Decrypts an AES-256-GCM encrypted string back to API key and provider.
 * Returns null if decryption fails or authentication tag is invalid.
 */
export function decryptApiKey(encryptedValue: string): EncryptedPayload | null {
  try {
    const parts = encryptedValue.split(":");
    if (parts.length !== 3) {
      return null;
    }

    const [ivHex, authTagHex, cipherHex] = parts;
    if (!ivHex || !authTagHex || !cipherHex) {
      return null;
    }

    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");

    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(cipherHex, "hex", "utf8");
    decrypted += decipher.final("utf8");

    const parsed = JSON.parse(decrypted) as EncryptedPayload;
    if (!parsed.apiKey || !parsed.provider) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}
