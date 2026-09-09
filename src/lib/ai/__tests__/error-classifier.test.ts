import { describe, it, expect } from "vitest";
import { classifyError, sanitizeErrorMessage } from "../error-classifier";

describe("error-classifier", () => {
  describe("sanitizeErrorMessage", () => {
    it("redacts Gemini API keys from messages", () => {
      const input = "Failed with key AIzaSyA12345678901234567890123456789012";
      const sanitized = sanitizeErrorMessage(input);
      expect(sanitized).toBe("Failed with key [REDACTED_API_KEY]");
    });

    it("redacts OpenAI and Anthropic API keys", () => {
      const input =
        "OpenAI sk-abcdef1234567890123456 and Claude sk-ant-api03-abcdef1234567890123456 failed";
      const sanitized = sanitizeErrorMessage(input);
      expect(sanitized).not.toContain("sk-abcdef");
      expect(sanitized).not.toContain("sk-ant-api03");
      expect(sanitized).toContain("[REDACTED_API_KEY]");
    });

    it("redacts Authorization Bearer tokens", () => {
      const input =
        "Request rejected for Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.test";
      const sanitized = sanitizeErrorMessage(input);
      expect(sanitized).toContain("Bearer [REDACTED_TOKEN]");
      expect(sanitized).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    });

    it("redacts query parameter keys in URLs", () => {
      const input =
        "https://generativelanguage.googleapis.com/v1beta/models?key=AIzaSyA12345678901234567890123456789012&alt=sse";
      const sanitized = sanitizeErrorMessage(input);
      expect(sanitized).toContain("key=[REDACTED_KEY]");
      expect(sanitized).not.toContain(
        "AIzaSyA12345678901234567890123456789012",
      );
    });

    it("redacts absolute filesystem paths and stack frame lines", () => {
      const input =
        "Error in /Users/developer/codebase-visualizer/src/index.ts\n    at Object.run (/Users/developer/codebase-visualizer/src/app.ts:25:12)";
      const sanitized = sanitizeErrorMessage(input);
      expect(sanitized).not.toContain("/Users/developer");
      expect(sanitized).toContain("[REDACTED_PATH]/index.ts");
    });

    it("returns empty string when given empty text", () => {
      expect(sanitizeErrorMessage("")).toBe("");
    });
  });

  describe("classifyError", () => {
    it("classifies HTTP 429 status as rate_limit with countdown metadata", () => {
      const notice = classifyError({
        status: 429,
        message: "Too many requests",
        retryAfterSeconds: 45,
      });

      expect(notice.code).toBe("rate_limit");
      expect(notice.title).toBe("Rate Limit Exceeded");
      expect(notice.suggestedAction).toBe("switch_demo");
      expect(notice.retryAfterSeconds).toBe(45);
    });

    it("classifies rate limit error strings with extracted wait duration", () => {
      const notice = classifyError({
        message: "Resource exhausted: please wait 25 seconds before retrying",
      });

      expect(notice.code).toBe("rate_limit");
      expect(notice.retryAfterSeconds).toBe(25);
      expect(notice.suggestedAction).toBe("switch_demo");
    });

    it("classifies HTTP 401 and 403 as auth_error directing to key settings", () => {
      const notice = classifyError({
        status: 401,
        message: "Unauthorized access: invalid api key provided",
      });

      expect(notice.code).toBe("auth_error");
      expect(notice.title).toBe("API Key Required");
      expect(notice.suggestedAction).toBe("open_keys");
    });

    it("classifies network exceptions and offline states as network_timeout", () => {
      const notice = classifyError({
        error: new TypeError("Failed to fetch"),
      });

      expect(notice.code).toBe("network_timeout");
      expect(notice.title).toBe("Connection Lost");
      expect(notice.suggestedAction).toBe("switch_demo");
    });

    it("classifies HTTP 503 and 502 as provider_outage", () => {
      const notice = classifyError({
        status: 503,
        message: "Service Unavailable",
      });

      expect(notice.code).toBe("provider_outage");
      expect(notice.title).toBe("Provider Service Outage");
      expect(notice.suggestedAction).toBe("switch_demo");
    });

    it("honors explicit input code and suggestedAction overrides", () => {
      const notice = classifyError({
        code: "provider_outage",
        suggestedAction: "retry",
        message: "Custom outage explanation",
      });

      expect(notice.code).toBe("provider_outage");
      expect(notice.suggestedAction).toBe("retry");
    });

    it("falls back to unknown category for unclassified issues", () => {
      const notice = classifyError({
        message: "Unexpected payload schema",
      });

      expect(notice.code).toBe("unknown");
      expect(notice.title).toBe("AI Service Notice");
      expect(notice.suggestedAction).toBe("retry");
      expect(notice.message).toBe("Unexpected payload schema");
    });
  });
});
