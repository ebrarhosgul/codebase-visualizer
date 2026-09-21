import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST as keysPost, DELETE as keysDelete } from "../ai/keys/route";
import {
  POST as tokenPost,
  GET as tokenGet,
  DELETE as tokenDelete,
} from "../auth/github-token/route";
import { POST as queryPost } from "../ai/query/route";
import { resetRateLimits } from "@/lib/ai/rate-limiter";
import { AI_KEY_COOKIE_NAME, encryptApiKey } from "@/lib/ai/crypto";
import { GITHUB_PAT_COOKIE_NAME } from "@/lib/github/crypto";
import type { Repository } from "@/entities";

const KEYS_URL = "http://localhost:3000/api/ai/keys";
const TOKEN_URL = "http://localhost:3000/api/auth/github-token";
const QUERY_URL = "http://localhost:3000/api/ai/query";

const VALID_PAT = "ghp_12345678901234567890abcdef";

const mockRepo: Repository = {
  id: "repo:test/app",
  owner: "test",
  name: "app",
  fullName: "test/app",
  defaultBranch: "main",
  commitSha: "abc",
  analyzedAt: "2026-01-01T00:00:00.000Z",
  totalFiles: 1,
  totalSymbols: 0,
  languages: {},
  schemaVersion: 1,
};

function post(
  url: string,
  body: unknown,
  headers: Record<string, string> = { "Content-Type": "application/json" },
): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("credential cookie endpoints reject cross site planting", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("refuses a POST /api/ai/keys from a foreign Origin and sets no cookie", async () => {
    const res = await keysPost(
      post(
        KEYS_URL,
        { provider: "gemini", apiKey: "attacker-key" },
        {
          "Content-Type": "application/json",
          Origin: "https://evil.example",
        },
      ),
    );

    expect(res.status).toBe(403);
    expect(res.cookies.get(AI_KEY_COOKIE_NAME)).toBeUndefined();
  });

  it("refuses a cross-site fetch by Sec-Fetch-Site metadata", async () => {
    const res = await keysPost(
      post(
        KEYS_URL,
        { provider: "gemini", apiKey: "attacker-key" },
        {
          "Content-Type": "application/json",
          "Sec-Fetch-Site": "cross-site",
        },
      ),
    );

    expect(res.status).toBe(403);
    expect(res.cookies.get(AI_KEY_COOKIE_NAME)).toBeUndefined();
  });

  it("refuses a text/plain form body carrying valid JSON (the enctype=text/plain attack)", async () => {
    const res = await keysPost(
      post(
        KEYS_URL,
        { provider: "gemini", apiKey: "attacker-key", pad: "=" },
        { "Content-Type": "text/plain" },
      ),
    );

    expect(res.status).toBe(400);
    expect(res.cookies.get(AI_KEY_COOKIE_NAME)).toBeUndefined();
  });

  it("accepts a same origin JSON request", async () => {
    const res = await keysPost(
      post(
        KEYS_URL,
        { provider: "gemini", apiKey: "my-key" },
        {
          "Content-Type": "application/json",
          Origin: "http://localhost:3000",
        },
      ),
    );

    expect(res.status).toBe(200);
    expect(res.cookies.get(AI_KEY_COOKIE_NAME)?.value).toBeTruthy();
  });

  it("caps the request body size", async () => {
    const res = await keysPost(
      post(KEYS_URL, {
        provider: "gemini",
        apiKey: "k".repeat(8 * 1024),
      }),
    );
    expect(res.status).toBe(413);
  });

  it("rejects non string field types", async () => {
    const res = await keysPost(
      post(KEYS_URL, { provider: "gemini", apiKey: 42 }),
    );
    expect(res.status).toBe(400);
  });

  it("refuses a cross site DELETE so credentials cannot be cleared remotely", async () => {
    const res = await keysDelete(
      new NextRequest(KEYS_URL, {
        method: "DELETE",
        headers: { Origin: "https://evil.example" },
      }),
    );
    expect(res.status).toBe(403);
    expect(res.cookies.get(AI_KEY_COOKIE_NAME)).toBeUndefined();
  });

  it("refuses a foreign Origin on POST /api/auth/github-token", async () => {
    const res = await tokenPost(
      post(
        TOKEN_URL,
        { token: VALID_PAT },
        {
          "Content-Type": "application/json",
          Origin: "https://evil.example",
        },
      ),
    );
    expect(res.status).toBe(403);
    expect(res.cookies.get(GITHUB_PAT_COOKIE_NAME)).toBeUndefined();
  });

  it("refuses a text/plain form body on POST /api/auth/github-token", async () => {
    const res = await tokenPost(
      post(TOKEN_URL, { token: VALID_PAT }, { "Content-Type": "text/plain" }),
    );
    expect(res.status).toBe(400);
    expect(res.cookies.get(GITHUB_PAT_COOKIE_NAME)).toBeUndefined();
  });

  it("refuses a cross site DELETE on /api/auth/github-token", async () => {
    const res = await tokenDelete(
      new NextRequest(TOKEN_URL, {
        method: "DELETE",
        headers: { "Sec-Fetch-Site": "cross-site" },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("marks GitHub token status responses no-store", async () => {
    const res = await tokenGet(new NextRequest(TOKEN_URL, { method: "GET" }));
    expect(res.headers.get("Cache-Control")).toContain("no-store");
  });

  it("fails closed when AI_COOKIE_SECRET is missing: no cookie is issued", async () => {
    vi.stubEnv("AI_COOKIE_SECRET", "");
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await keysPost(
      post(KEYS_URL, { provider: "gemini", apiKey: "my-key" }),
    );

    expect(res.status).toBe(500);
    expect(res.cookies.get(AI_KEY_COOKIE_NAME)).toBeUndefined();
    const json = (await res.json()) as { success: boolean; error: string };
    expect(json.success).toBe(false);
    expect(json.error).not.toContain("AI_COOKIE_SECRET");
  });

  it("fails closed for GitHub tokens when no cookie secret is configured", async () => {
    vi.stubEnv("AI_COOKIE_SECRET", "");
    vi.stubEnv("COOKIE_ENCRYPTION_KEY", "");
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await tokenPost(post(TOKEN_URL, { token: VALID_PAT }));

    expect(res.status).toBe(500);
    expect(res.cookies.get(GITHUB_PAT_COOKIE_NAME)).toBeUndefined();
  });
});

describe("POST /api/ai/query credential handling", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    resetRateLimits();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  const liveBody = (provider: string) => ({
    repository: mockRepo,
    messages: [{ role: "user", content: "hello" }],
    isDemo: false,
    provider,
  });

  it.each([
    ["gemini", "GEMINI_API_KEY"],
    ["openai", "OPENAI_API_KEY"],
    ["claude", "ANTHROPIC_API_KEY"],
  ])(
    "returns 401 and never calls upstream when only a server %s key exists",
    async (provider, envName) => {
      vi.stubEnv(envName, "server-operator-key-must-not-be-used");
      global.fetch = vi.fn();

      const res = await queryPost(post(QUERY_URL, liveBody(provider)));

      expect(res.status).toBe(401);
      expect(global.fetch).not.toHaveBeenCalled();
    },
  );

  it("refuses to send a cookie key to a different provider than it was saved for", async () => {
    global.fetch = vi.fn();
    const cookie = `${AI_KEY_COOKIE_NAME}=${encryptApiKey("sk-openai-key", "openai")}`;

    const res = await queryPost(
      post(QUERY_URL, liveBody("gemini"), {
        "Content-Type": "application/json",
        cookie,
      }),
    );

    expect(res.status).toBe(401);
    const json = (await res.json()) as {
      code: string;
      suggestedAction: string;
    };
    expect(json.code).toBe("auth_error");
    expect(json.suggestedAction).toBe("open_keys");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("uses the cookie key for the provider it was saved for", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          'data: {"candidates":[{"content":{"parts":[{"text":"ok"}]}}]}\n\n',
          { status: 200 },
        ),
      );
    const cookie = `${AI_KEY_COOKIE_NAME}=${encryptApiKey("caller-gemini-key", "gemini")}`;

    const res = await queryPost(
      post(QUERY_URL, liveBody("gemini"), {
        "Content-Type": "application/json",
        cookie,
      }),
    );

    expect(res.status).toBe(200);
    await res.text();
    const [, init] = vi.mocked(global.fetch).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe(
      "caller-gemini-key",
    );
  });

  it("refuses a foreign Origin", async () => {
    const res = await queryPost(
      post(QUERY_URL, liveBody("gemini"), {
        "Content-Type": "application/json",
        Origin: "https://evil.example",
      }),
    );
    expect(res.status).toBe(403);
  });

  it("rejects an oversized request body with 413", async () => {
    const res = await queryPost(
      post(QUERY_URL, {
        ...liveBody("gemini"),
        contextSummary: "x".repeat(11 * 1024 * 1024),
      }),
    );
    expect(res.status).toBe(413);
  });

  it("rejects an invalid message role", async () => {
    const res = await queryPost(
      post(QUERY_URL, {
        repository: mockRepo,
        messages: [{ role: "admin", content: "hi" }],
        isDemo: true,
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects too many messages", async () => {
    const res = await queryPost(
      post(QUERY_URL, {
        repository: mockRepo,
        messages: Array.from({ length: 101 }, () => ({
          role: "user",
          content: "hi",
        })),
        isDemo: true,
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects an unknown provider", async () => {
    const res = await queryPost(post(QUERY_URL, liveBody("mystery")));
    expect(res.status).toBe(400);
  });

  it("cannot dodge the rate limit by rotating the client supplied X-Forwarded-For prefix", async () => {
    const demoBody = {
      repository: mockRepo,
      messages: [{ role: "user", content: "q" }],
      isDemo: true,
    };

    for (let i = 0; i < 10; i++) {
      const res = await queryPost(
        post(QUERY_URL, demoBody, {
          "Content-Type": "application/json",
          "x-forwarded-for": `10.0.0.${i}, 203.0.113.77`,
        }),
      );
      expect(res.status).toBe(200);
      res.body?.getReader().cancel();
    }

    const blocked = await queryPost(
      post(QUERY_URL, demoBody, {
        "Content-Type": "application/json",
        "x-forwarded-for": "10.9.9.9, 203.0.113.77",
      }),
    );
    expect(blocked.status).toBe(429);
  });
});
