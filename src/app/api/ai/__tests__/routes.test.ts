import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST as keysPost, DELETE as keysDelete } from "../keys/route";
import { POST as queryPost } from "../query/route";
import { resetRateLimits } from "@/lib/ai/rate-limiter";
import { AI_KEY_COOKIE_NAME } from "@/lib/ai/crypto";

describe("AI API Routes", () => {
  beforeEach(() => {
    resetRateLimits();
  });

  describe("/api/ai/keys", () => {
    it("accepts valid provider and apiKey and sets cookie", async () => {
      const req = new NextRequest("http://localhost:3000/api/ai/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "gemini",
          apiKey: "test-api-key-12345",
        }),
      });

      const res = await keysPost(req);
      expect(res.status).toBe(200);

      const json = (await res.json()) as { success: boolean; provider: string };
      expect(json.success).toBe(true);
      expect(json.provider).toBe("gemini");

      const cookie = res.cookies.get(AI_KEY_COOKIE_NAME);
      expect(cookie).toBeDefined();
      expect(cookie?.value.split(":")).toHaveLength(3);
    });

    it("rejects unsupported provider", async () => {
      const req = new NextRequest("http://localhost:3000/api/ai/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "unsupported",
          apiKey: "key",
        }),
      });

      const res = await keysPost(req);
      expect(res.status).toBe(400);
      const json = (await res.json()) as { success: boolean; error: string };
      expect(json.success).toBe(false);
      expect(json.error).toContain("Unsupported provider");
    });

    it("rejects empty or whitespace only apiKey (covers: AC-3)", async () => {
      const req = new NextRequest("http://localhost:3000/api/ai/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "gemini",
          apiKey: "   ",
        }),
      });

      const res = await keysPost(req);
      expect(res.status).toBe(400);
      const json = (await res.json()) as { success: boolean; error: string };
      expect(json.success).toBe(false);
      expect(json.error).toContain("cannot be empty");
    });

    it("rejects malformed JSON body (covers: AC-3)", async () => {
      const req = new NextRequest("http://localhost:3000/api/ai/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "invalid-json",
      });

      const res = await keysPost(req);
      expect(res.status).toBe(400);
    });

    it("clears stored credentials on DELETE (covers: AC-3)", async () => {
      const res = await keysDelete();
      expect(res.status).toBe(200);
      const cookie = res.cookies.get(AI_KEY_COOKIE_NAME);
      expect(cookie?.value).toBe("");
    });
  });

  describe("/api/ai/query", () => {
    const mockRepo = {
      id: "repo:test/app",
      owner: "test",
      name: "app",
      fullName: "test/app",
      defaultBranch: "main",
      commitSha: "sha",
      analyzedAt: "2026-01-01T00:00:00.000Z",
      totalFiles: 1,
      totalSymbols: 0,
      languages: {},
      schemaVersion: 1,
    };

    it("rejects requests missing repository or messages (covers: AC-1)", async () => {
      const req = new NextRequest("http://localhost:3000/api/ai/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDemo: true }),
      });

      const res = await queryPost(req);
      expect(res.status).toBe(400);
    });

    it("rejects malformed JSON body with status 400 (covers: AC-1)", async () => {
      const req = new NextRequest("http://localhost:3000/api/ai/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "malformed-json",
      });

      const res = await queryPost(req);
      expect(res.status).toBe(400);
    });

    it("returns 401 when non demo mode has no API key (covers: AC-3)", async () => {
      const originalKey = process.env.GEMINI_API_KEY;
      delete process.env.GEMINI_API_KEY;

      try {
        const req = new NextRequest("http://localhost:3000/api/ai/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            repository: mockRepo,
            messages: [{ role: "user", content: "hello" }],
            isDemo: false,
            provider: "gemini",
          }),
        });

        const res = await queryPost(req);
        expect(res.status).toBe(401);
        const json = (await res.json()) as {
          error: string;
          code: string;
          suggestedAction: string;
          fallbackNotice: { code: string; suggestedAction: string };
        };
        expect(json.code).toBe("auth_error");
        expect(json.suggestedAction).toBe("open_keys");
        expect(json.fallbackNotice).toBeDefined();
        expect(json.fallbackNotice.code).toBe("auth_error");
      } finally {
        if (originalKey) {
          process.env.GEMINI_API_KEY = originalKey;
        }
      }
    });

    it("streams demo events successfully in demo mode (covers: AC-1, AC-2)", async () => {
      const req = new NextRequest("http://localhost:3000/api/ai/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repository: mockRepo,
          messages: [
            { role: "user", content: "Tell me about this repository" },
          ],
          isDemo: true,
        }),
      });

      const res = await queryPost(req);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("text/event-stream");

      const reader = res.body?.getReader();
      expect(reader).toBeDefined();

      const { value } = await reader!.read();
      const text = new TextDecoder().decode(value);
      expect(text).toContain("data:");
      reader!.cancel();
    });

    it("returns 429 when client IP exceeds rate limit (covers: AC-1, AC-3)", async () => {
      const clientIp = "192.0.2.55";

      // Exhaust demo mode limit (10 requests)
      for (let i = 0; i < 10; i++) {
        const req = new NextRequest("http://localhost:3000/api/ai/query", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-forwarded-for": clientIp,
          },
          body: JSON.stringify({
            repository: mockRepo,
            messages: [{ role: "user", content: "query" }],
            isDemo: true,
          }),
        });
        const res = await queryPost(req);
        expect(res.status).toBe(200);
        res.body?.getReader().cancel();
      }

      // Eleventh request must return 429
      const blockedReq = new NextRequest("http://localhost:3000/api/ai/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": clientIp,
        },
        body: JSON.stringify({
          repository: mockRepo,
          messages: [{ role: "user", content: "query" }],
          isDemo: true,
        }),
      });

      const blockedRes = await queryPost(blockedReq);
      expect(blockedRes.status).toBe(429);
      expect(blockedRes.headers.get("Retry-After")).toBeDefined();

      const json = (await blockedRes.json()) as {
        error: string;
        code: string;
        suggestedAction: string;
        fallbackNotice: {
          code: string;
          suggestedAction: string;
          retryAfterSeconds: number;
        };
      };
      expect(json.code).toBe("rate_limit");
      expect(json.suggestedAction).toBe("switch_demo");
      expect(json.fallbackNotice).toBeDefined();
      expect(json.fallbackNotice.code).toBe("rate_limit");
      expect(json.fallbackNotice.retryAfterSeconds).toBeDefined();
    });
  });
});
