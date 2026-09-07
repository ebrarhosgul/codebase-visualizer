import { describe, it, expect } from "vitest";
import {
  validateGithubTokenFormat,
  maskGithubToken,
  encryptGithubToken,
  decryptGithubToken,
  GITHUB_PAT_COOKIE_NAME,
} from "../crypto";

describe("GitHub token crypto utilities", () => {
  it("exports correct cookie name (covers: AC-5)", () => {
    expect(GITHUB_PAT_COOKIE_NAME).toBe("github_pat");
  });

  it("validates classic token prefixes (covers: AC-5)", () => {
    expect(validateGithubTokenFormat("ghp_12345678901234567890")).toBe(true);
    expect(validateGithubTokenFormat("ghp_short")).toBe(false);
    expect(
      validateGithubTokenFormat("invalid_prefix_12345678901234567890"),
    ).toBe(false);
    expect(validateGithubTokenFormat("")).toBe(false);
  });

  it("validates fine-grained token prefixes (covers: AC-5)", () => {
    expect(
      validateGithubTokenFormat("github_pat_12345678901234567890123456"),
    ).toBe(true);
    expect(validateGithubTokenFormat("github_pat_short")).toBe(false);
  });

  it("masks tokens for safe display preserving prefix and last 4 chars (covers: AC-5)", () => {
    expect(maskGithubToken("ghp_1234567890abcdef")).toBe("ghp_...cdef");
    expect(maskGithubToken("github_pat_1234567890abcdef")).toBe(
      "github_pat_...cdef",
    );
  });

  it("encrypts and decrypts GitHub token cleanly with AES-256-GCM (covers: AC-5)", () => {
    const token = "ghp_1234567890abcdef123456";
    const encrypted = encryptGithubToken(token);
    expect(typeof encrypted).toBe("string");
    expect(encrypted.split(":")).toHaveLength(3);

    const decrypted = decryptGithubToken(encrypted);
    expect(decrypted).toBe(token);
  });

  it("rejects tampered or malformed ciphertext safely (covers: AC-5)", () => {
    expect(decryptGithubToken("invalid:format")).toBeNull();
    expect(decryptGithubToken("not:a:valid:gcm:token")).toBeNull();
    expect(decryptGithubToken("")).toBeNull();

    const token = "ghp_1234567890abcdef123456";
    const encrypted = encryptGithubToken(token);
    const [iv, tag, cipher] = encrypted.split(":");
    const tampered = `${iv}:${tag.slice(0, -2)}00:${cipher}`;
    expect(decryptGithubToken(tampered)).toBeNull();
  });

  it("trims whitespace when encrypting token (covers: AC-5)", () => {
    const token = "  ghp_1234567890abcdef123456  ";
    const encrypted = encryptGithubToken(token);
    const decrypted = decryptGithubToken(encrypted);
    expect(decrypted).toBe("ghp_1234567890abcdef123456");
  });

  it("encrypts and decrypts with custom COOKIE_ENCRYPTION_KEY (covers: AC-5)", () => {
    const originalEnv = process.env.COOKIE_ENCRYPTION_KEY;
    try {
      process.env.COOKIE_ENCRYPTION_KEY =
        "custom-test-secret-key-for-encryption-test";
      const token = "ghp_custom_env_test_token_123456";
      const encrypted = encryptGithubToken(token);
      const decrypted = decryptGithubToken(encrypted);
      expect(decrypted).toBe(token);
    } finally {
      process.env.COOKIE_ENCRYPTION_KEY = originalEnv;
    }
  });
});
