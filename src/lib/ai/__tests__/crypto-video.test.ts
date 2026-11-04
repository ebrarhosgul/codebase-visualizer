import { describe, it, expect } from "vitest";
import {
  encryptApiKey,
  decryptApiKey,
  encryptVideoApiKey,
  decryptVideoApiKey,
  AI_KEY_COOKIE_NAME,
  VIDEO_KEY_COOKIE_NAME,
} from "../crypto";

describe("video crypto isolation (AC-1, AC-3)", () => {
  it("exports isolated cookie names", () => {
    expect(AI_KEY_COOKIE_NAME).toBe("cv_ai_key");
    expect(VIDEO_KEY_COOKIE_NAME).toBe("cv_ai_key_scrimba");
    expect(AI_KEY_COOKIE_NAME).not.toBe(VIDEO_KEY_COOKIE_NAME);
  });

  it("encrypts and decrypts Scrimba video API keys with video-key purpose", () => {
    const rawKey = "scr_live_1234567890abcdef";
    const encrypted = encryptVideoApiKey(rawKey, "scrimba");

    expect(typeof encrypted).toBe("string");
    expect(encrypted.split(":")).toHaveLength(3);

    const decrypted = decryptVideoApiKey(encrypted);
    expect(decrypted).not.toBeNull();
    expect(decrypted?.apiKey).toBe(rawKey);
    expect(decrypted?.provider).toBe("scrimba");
  });

  it("prevents cross purpose replay attacks between chat and video cookies", () => {
    const chatKey = "sk-openai-key-1234567890";
    const videoKey = "scr_live_9876543210fedcba";

    const encryptedChat = encryptApiKey(chatKey, "openai");
    const encryptedVideo = encryptVideoApiKey(videoKey, "scrimba");

    // Chat ciphertext must fail when decrypted with video purpose
    expect(decryptVideoApiKey(encryptedChat)).toBeNull();

    // Video ciphertext must fail when decrypted with chat purpose
    expect(decryptApiKey(encryptedVideo)).toBeNull();
  });
});
