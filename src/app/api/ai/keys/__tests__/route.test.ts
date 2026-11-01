import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST, GET, DELETE } from "../route";
import {
  AI_KEY_COOKIE_NAME,
  VIDEO_KEY_COOKIE_NAME,
  encryptApiKey,
  encryptVideoApiKey,
} from "@/lib/ai/crypto";

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
    it("validates Scrimba scr_live_ prefix and sets cv_ai_key_scrimba with SameSite=Strict", async () => {
      const invalidReq = createRequest("POST", undefined, {
        provider: "scrimba",
        apiKey: "invalid-key-no-prefix",
      });
      const invalidRes = await POST(invalidReq);
      expect(invalidRes.status).toBe(400);

      const validReq = createRequest("POST", undefined, {
        provider: "scrimba",
        apiKey: "scr_live_1234567890abcdef",
      });
      const validRes = await POST(validReq);
      expect(validRes.status).toBe(200);

      const videoCookie = validRes.cookies.get(VIDEO_KEY_COOKIE_NAME);
      expect(videoCookie).toBeDefined();
      expect(videoCookie?.sameSite).toBe("strict");
      expect(videoCookie?.httpOnly).toBe(true);

      const chatCookie = validRes.cookies.get(AI_KEY_COOKIE_NAME);
      expect(chatCookie).toBeUndefined();
    });

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

      const videoCookie = res.cookies.get(VIDEO_KEY_COOKIE_NAME);
      expect(videoCookie).toBeUndefined();
    });
  });

  describe("GET /api/ai/keys", () => {
    it("returns key status for chat and video providers independently", async () => {
      const noKeysReq = createRequest("GET");
      const noKeysRes = await GET(noKeysReq);
      const noKeysData = await noKeysRes.json();
      expect(noKeysData.hasKey).toBe(false);
      expect(noKeysData.hasVideoKey).toBe(false);

      const chatCipher = encryptApiKey("sk-chat-key", "claude");
      const videoCipher = encryptVideoApiKey(
        "scr_live_video_key_123",
        "scrimba",
      );

      const bothKeysReq = createRequest("GET", undefined, undefined, {
        [AI_KEY_COOKIE_NAME]: chatCipher,
        [VIDEO_KEY_COOKIE_NAME]: videoCipher,
      });
      const bothKeysRes = await GET(bothKeysReq);
      const bothKeysData = await bothKeysRes.json();
      expect(bothKeysData.hasKey).toBe(true);
      expect(bothKeysData.provider).toBe("claude");
      expect(bothKeysData.hasVideoKey).toBe(true);
      expect(bothKeysData.videoProvider).toBe("scrimba");
    });
  });

  describe("DELETE /api/ai/keys", () => {
    it("clears video key independently with ?scope=video", async () => {
      const req = createRequest(
        "DELETE",
        "http://localhost:3000/api/ai/keys?scope=video",
      );
      const res = await DELETE(req);
      expect(res.status).toBe(200);

      const videoCookie = res.cookies.get(VIDEO_KEY_COOKIE_NAME);
      expect(videoCookie?.maxAge).toBe(0);

      const chatCookie = res.cookies.get(AI_KEY_COOKIE_NAME);
      expect(chatCookie).toBeUndefined();
    });

    it("clears chat key independently with ?scope=chat", async () => {
      const req = createRequest(
        "DELETE",
        "http://localhost:3000/api/ai/keys?scope=chat",
      );
      const res = await DELETE(req);
      expect(res.status).toBe(200);

      const chatCookie = res.cookies.get(AI_KEY_COOKIE_NAME);
      expect(chatCookie?.maxAge).toBe(0);

      const videoCookie = res.cookies.get(VIDEO_KEY_COOKIE_NAME);
      expect(videoCookie).toBeUndefined();
    });
  });
});
