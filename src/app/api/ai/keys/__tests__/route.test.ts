import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST, GET, DELETE } from "../route";
import { AI_KEY_COOKIE_NAME, encryptApiKey } from "@/lib/ai/crypto";

describe("/api/ai/keys route", () => {
  beforeEach(() => {
    process.env.AI_COOKIE_SECRET =
      "test-secret-at-least-32-characters-long-12345";
  });

  function createRequest(
    method: string,
    url = "http://localhost:3000/api/ai/keys",
    body?: unknown,
    cookies?: Record<string, string>,
  ): NextRequest {
    const headers = new Headers();
    headers.set("host", "localhost:3000");
    headers.set("origin", "http://localhost:3000");
    headers.set("sec-fetch-site", "same-origin");
    if (body) {
      headers.set("content-type", "application/json");
    }
    if (cookies) {
      const cookieStr = Object.entries(cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join("; ");
      headers.set("cookie", cookieStr);
    }

    return new NextRequest(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  describe("POST /api/ai/keys", () => {
    it("saves chat provider keys to cv_ai_key with SameSite=Lax", async () => {
      const req = createRequest("POST", undefined, {
        provider: "openai",
        apiKey: "sk-openai-key-1234567890",
      });
      const res = await POST(req);
      expect(res.status).toBe(200);

      const chatCookie = res.cookies.get(AI_KEY_COOKIE_NAME);
      expect(chatCookie).toBeDefined();
      expect(chatCookie?.sameSite).toBe("lax");
      expect(chatCookie?.httpOnly).toBe(true);
    });

    it("preserves previously saved chat provider keys when adding a new chat provider key", async () => {
      const firstReq = createRequest("POST", undefined, {
        provider: "gemini",
        apiKey: "AIzaSyGeminiKey123456",
      });
      const firstRes = await POST(firstReq);
      const firstCookie = firstRes.cookies.get(AI_KEY_COOKIE_NAME)?.value ?? "";

      const secondReq = createRequest(
        "POST",
        undefined,
        {
          provider: "openai",
          apiKey: "sk-proj-OpenAiKey987654",
        },
        { [AI_KEY_COOKIE_NAME]: firstCookie },
      );
      const secondRes = await POST(secondReq);
      const secondData = await secondRes.json();
      expect(secondData.configuredProviders).toEqual(["gemini", "openai"]);

      const mergedCookie =
        secondRes.cookies.get(AI_KEY_COOKIE_NAME)?.value ?? "";
      const getRes = await GET(
        createRequest("GET", undefined, undefined, {
          [AI_KEY_COOKIE_NAME]: mergedCookie,
        }),
      );
      const getData = await getRes.json();
      expect(getData.hasKey).toBe(true);
      expect(getData.provider).toBe("openai");
      expect(getData.configuredProviders).toEqual(["gemini", "openai"]);
      expect(getData.configuredKeyCount).toBe(2);
      expect(getData.maskedKeys.gemini).toBe("AIza••••3456");
      expect(getData.maskedKeys.openai).toBe("sk-p••••7654");
    });
  });

  describe("GET /api/ai/keys", () => {
    it("returns configured chat key status without exposing secrets", async () => {
      const noKeysRes = await GET(createRequest("GET"));
      expect(await noKeysRes.json()).toEqual({
        hasKey: false,
        configuredProviders: [],
        allConfiguredProviders: [],
        configuredKeyCount: 0,
        maskedKeys: {},
      });
      expect(noKeysRes.headers.get("cache-control")).toBe(
        "no-store, max-age=0",
      );
      const key = "sk-chat-key";
      const res = await GET(
        createRequest("GET", undefined, undefined, {
          [AI_KEY_COOKIE_NAME]: encryptApiKey(key, "claude"),
        }),
      );
      expect(await res.json()).toEqual({
        hasKey: true,
        provider: "claude",
        configuredProviders: ["claude"],
        allConfiguredProviders: ["claude"],
        configuredKeyCount: 1,
        maskedKeys: { claude: "sk-c••••-key" },
      });
    });
  });

  describe("DELETE /api/ai/keys", () => {
    it.each(["provider=unsupported", "scope=unsupported"])(
      "rejects unsupported deletion targets without changing chat credentials (%s)",
      async (query) => {
        const res = await DELETE(
          createRequest("DELETE", `http://localhost:3000/api/ai/keys?${query}`),
        );
        expect(res.status).toBe(400);
        expect(res.headers.get("set-cookie")).toBeNull();
      },
    );

    it("clears all chat keys with ?scope=chat", async () => {
      const req = createRequest(
        "DELETE",
        "http://localhost:3000/api/ai/keys?scope=chat",
      );
      const res = await DELETE(req);
      expect(res.status).toBe(200);

      const chatCookie = res.cookies.get(AI_KEY_COOKIE_NAME);
      expect(chatCookie?.maxAge).toBe(0);
    });

    it("deletes an individual chat provider key via ?provider=openai while preserving other configured keys", async () => {
      const firstRes = await POST(
        createRequest("POST", undefined, {
          provider: "gemini",
          apiKey: "AIzaSyGeminiKey123456",
        }),
      );
      const firstCookie = firstRes.cookies.get(AI_KEY_COOKIE_NAME)?.value ?? "";
      const secondRes = await POST(
        createRequest(
          "POST",
          undefined,
          {
            provider: "openai",
            apiKey: "sk-proj-OpenAiKey987654",
          },
          { [AI_KEY_COOKIE_NAME]: firstCookie },
        ),
      );
      const mergedCookie =
        secondRes.cookies.get(AI_KEY_COOKIE_NAME)?.value ?? "";

      const deleteOpenAiRes = await DELETE(
        createRequest(
          "DELETE",
          "http://localhost:3000/api/ai/keys?provider=openai",
          undefined,
          { [AI_KEY_COOKIE_NAME]: mergedCookie },
        ),
      );
      expect(deleteOpenAiRes.status).toBe(200);
      const deleteData = await deleteOpenAiRes.json();
      expect(deleteData.configuredProviders).toEqual(["gemini"]);

      const updatedCookie =
        deleteOpenAiRes.cookies.get(AI_KEY_COOKIE_NAME)?.value ?? "";
      expect(updatedCookie.length).toBeGreaterThan(0);

      const getRes = await GET(
        createRequest("GET", undefined, undefined, {
          [AI_KEY_COOKIE_NAME]: updatedCookie,
        }),
      );
      const getData = await getRes.json();
      expect(getData.hasKey).toBe(true);
      expect(getData.provider).toBe("gemini");
      expect(getData.configuredProviders).toEqual(["gemini"]);
    });
  });
});
