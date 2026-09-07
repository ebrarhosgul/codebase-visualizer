import { describe, it, expect } from "vitest";
import { encryptApiKey, decryptApiKey, AI_KEY_COOKIE_NAME } from "../crypto";

// covers: AC-3
describe("ai crypto", () => {
  it("exports correct cookie name (covers: AC-3)", () => {
    expect(AI_KEY_COOKIE_NAME).toBe("cv_ai_key");
  });

  it("encrypts and decrypts API key and provider cleanly (covers: AC-3)", () => {
    const originalKey = "sk-ant-test-secret-key-123456";
    const provider = "claude";

    const encrypted = encryptApiKey(originalKey, provider);
    expect(typeof encrypted).toBe("string");
    expect(encrypted.split(":")).toHaveLength(3);

    const decrypted = decryptApiKey(encrypted);
    expect(decrypted).not.toBeNull();
    expect(decrypted?.apiKey).toBe(originalKey);
    expect(decrypted?.provider).toBe(provider);
  });

  it("handles all supported providers cleanly (covers: AC-3)", () => {
    for (const provider of ["gemini", "openai", "claude"] as const) {
      const encrypted = encryptApiKey(`key-for-${provider}`, provider);
      const decrypted = decryptApiKey(encrypted);
      expect(decrypted?.provider).toBe(provider);
      expect(decrypted?.apiKey).toBe(`key-for-${provider}`);
    }
  });

  it("rejects tampered authentication tag without throwing (covers: AC-3)", () => {
    const encrypted = encryptApiKey("my-secret-key", "gemini");
    const [iv, , cipher] = encrypted.split(":");
    // Invert characters in auth tag
    const tamperedTag = "00112233445566778899aabbccddeeff";
    const tampered = `${iv}:${tamperedTag}:${cipher}`;
    expect(decryptApiKey(tampered)).toBeNull();
  });

  it("rejects tampered ciphertext without throwing (covers: AC-3)", () => {
    const encrypted = encryptApiKey("my-secret-key", "gemini");
    const [iv, tag, cipher] = encrypted.split(":");
    const tamperedCipher =
      cipher.slice(0, -2) + (cipher.endsWith("aa") ? "bb" : "aa");
    const tampered = `${iv}:${tag}:${tamperedCipher}`;
    expect(decryptApiKey(tampered)).toBeNull();
  });

  it("returns null for malformed or corrupted encrypted string (covers: AC-3)", () => {
    expect(decryptApiKey("malformed")).toBeNull();
    expect(decryptApiKey("a:b")).toBeNull();
    expect(decryptApiKey("badiv:badtag:badcipher")).toBeNull();
    expect(decryptApiKey("::")).toBeNull();
  });
});
