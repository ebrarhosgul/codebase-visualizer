import { describe, it, expect, afterEach, vi } from "vitest";
import {
  CookieSecretMissingError,
  CREDENTIAL_COOKIE_TTL_SECONDS,
  openCookiePayload,
  requireCookieSecret,
  sealCookiePayload,
} from "../cookie-crypto";
import { encryptApiKey, decryptApiKey } from "@/lib/ai/crypto";
import { encryptGithubToken, decryptGithubToken } from "@/lib/github/crypto";

const SECRET = "unit-test-secret-with-plenty-of-entropy-0123456789";

describe("cookie secret handling (fail closed)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("throws when the secret is unset", () => {
    vi.stubEnv("AI_COOKIE_SECRET", "");
    expect(() => requireCookieSecret(["AI_COOKIE_SECRET"])).toThrow(
      CookieSecretMissingError,
    );
  });

  it("throws when the secret is only whitespace", () => {
    vi.stubEnv("AI_COOKIE_SECRET", "   ");
    expect(() => requireCookieSecret(["AI_COOKIE_SECRET"])).toThrow(
      /AI_COOKIE_SECRET is not set/,
    );
  });

  it("names the variables it needs in the error message", () => {
    vi.stubEnv("AI_COOKIE_SECRET", "");
    vi.stubEnv("COOKIE_ENCRYPTION_KEY", "");
    try {
      requireCookieSecret(["COOKIE_ENCRYPTION_KEY", "AI_COOKIE_SECRET"]);
      expect.unreachable();
    } catch (err) {
      expect((err as Error).message).toContain("COOKIE_ENCRYPTION_KEY");
      expect((err as Error).message).toContain("AI_COOKIE_SECRET");
    }
  });

  it("refuses to encrypt or decrypt AI keys without AI_COOKIE_SECRET", () => {
    const sealed = encryptApiKey("sk-test-key", "openai");
    vi.stubEnv("AI_COOKIE_SECRET", "");

    expect(() => encryptApiKey("sk-test-key", "openai")).toThrow(
      CookieSecretMissingError,
    );
    expect(() => decryptApiKey(sealed)).toThrow(CookieSecretMissingError);
  });

  it("does not fall back to COOKIE_ENCRYPTION_KEY for AI keys", () => {
    vi.stubEnv("AI_COOKIE_SECRET", "");
    vi.stubEnv("COOKIE_ENCRYPTION_KEY", SECRET);
    expect(() => encryptApiKey("sk-test-key", "openai")).toThrow(
      CookieSecretMissingError,
    );
  });

  it("refuses GitHub token encryption when no secret is configured", () => {
    vi.stubEnv("AI_COOKIE_SECRET", "");
    vi.stubEnv("COOKIE_ENCRYPTION_KEY", "");
    expect(() => encryptGithubToken("ghp_12345678901234567890")).toThrow(
      CookieSecretMissingError,
    );
    expect(() => decryptGithubToken("a:b:c")).toThrow(CookieSecretMissingError);
  });

  it("falls back from COOKIE_ENCRYPTION_KEY to AI_COOKIE_SECRET for GitHub tokens", () => {
    vi.stubEnv("COOKIE_ENCRYPTION_KEY", "");
    const sealed = encryptGithubToken("ghp_12345678901234567890");
    expect(decryptGithubToken(sealed)).toBe("ghp_12345678901234567890");
  });

  it("does not decrypt data sealed under a different secret", () => {
    const sealed = sealCookiePayload({ value: "x" }, "ai-key", SECRET);
    expect(openCookiePayload(sealed, "ai-key", `${SECRET}-other`)).toBeNull();
  });
});

describe("sealed cookie payloads", () => {
  it("round trips a payload and stamps an expiry", () => {
    const now = 1_700_000_000_000;
    const sealed = sealCookiePayload({ value: "hello" }, "ai-key", SECRET, now);
    const opened = openCookiePayload(sealed, "ai-key", SECRET, now + 1000);

    expect(opened?.value).toBe("hello");
    expect(opened?.exp).toBe(now + CREDENTIAL_COOKIE_TTL_SECONDS * 1000);
  });

  it("rejects an expired payload even though the ciphertext is authentic", () => {
    const now = 1_700_000_000_000;
    const sealed = sealCookiePayload({ value: "hello" }, "ai-key", SECRET, now);
    const afterExpiry = now + CREDENTIAL_COOKIE_TTL_SECONDS * 1000 + 1;

    expect(openCookiePayload(sealed, "ai-key", SECRET, afterExpiry)).toBeNull();
  });

  it("binds a ciphertext to its purpose so it cannot be replayed as another cookie", () => {
    const sealed = sealCookiePayload({ value: "hello" }, "ai-key", SECRET);
    expect(openCookiePayload(sealed, "github-pat", SECRET)).toBeNull();
  });

  it("rejects an AI key cookie presented as a GitHub token cookie", () => {
    const aiCookie = encryptApiKey("sk-test-key", "openai");
    expect(decryptGithubToken(aiCookie)).toBeNull();
  });

  it("rejects a GitHub token cookie presented as an AI key cookie", () => {
    const githubCookie = encryptGithubToken("ghp_12345678901234567890");
    expect(decryptApiKey(githubCookie)).toBeNull();
  });

  it("rejects ciphertext sealed without the current format", () => {
    expect(openCookiePayload("aa:bb:cc", "ai-key", SECRET)).toBeNull();
  });
});
