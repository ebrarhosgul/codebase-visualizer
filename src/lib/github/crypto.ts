import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

export {
  GITHUB_PAT_COOKIE_NAME,
  validateGithubTokenFormat,
  maskGithubToken,
} from "./token-validation";

/**
 * Derives a deterministic 32-byte key from environment secret or fallback development key.
 */
function getEncryptionKey(): Buffer {
  const secret =
    process.env.COOKIE_ENCRYPTION_KEY ||
    process.env.AI_COOKIE_SECRET ||
    "codebase-visualizer-development-secret-key-32-bytes";
  return createHash("sha256").update(secret).digest();
}

/**
 * Encrypts a GitHub personal access token using AES-256-GCM.
 * Output format: iv:authTag:ciphertext (all in hex).
 */
export function encryptGithubToken(token: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12); // 96-bit IV recommended for GCM
  const cipher = createCipheriv("aes-256-gcm", key, iv);

  let encrypted = cipher.update(token.trim(), "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Decrypts an AES-256-GCM encrypted GitHub token.
 * Returns null if decryption fails or format is invalid.
 */
export function decryptGithubToken(encryptedValue: string): string | null {
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

    if (!decrypted || decrypted.trim().length === 0) {
      return null;
    }

    return decrypted.trim();
  } catch {
    return null;
  }
}
