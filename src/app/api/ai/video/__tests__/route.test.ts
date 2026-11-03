import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../route";
import { GET as GET_JOB } from "../[jobId]/route";
import { VIDEO_KEY_COOKIE_NAME, encryptVideoApiKey } from "@/lib/ai/crypto";

describe("/api/ai/video routes (AC-4, AC-5, AC-11, AC-12)", () => {
  const secretKey = "scr_live_testing1234567890abcdef";
  let videoCookieValue: string;

  beforeEach(() => {
    process.env.AI_COOKIE_SECRET =
      "test-secret-at-least-32-characters-long-12345";
    process.env.SCRIMBA_API_BASE_URL = "https://api.scrimba.com";
    videoCookieValue = encryptVideoApiKey(secretKey, "scrimba");
    vi.restoreAllMocks();
  });

  function createRequest(
    method: string,
    url: string,
    body?: unknown,
    hasCookie = true,
  ): NextRequest {
    const headers = new Headers();
    headers.set("host", "localhost:3000");
    headers.set("origin", "http://localhost:3000");
    headers.set("sec-fetch-site", "same-origin");
    if (body) {
      headers.set("content-type", "application/json");
    }
    if (hasCookie) {
      headers.set("cookie", `${VIDEO_KEY_COOKIE_NAME}=${videoCookieValue}`);
    }

    return new NextRequest(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  describe("POST /api/ai/video", () => {
    it("returns 401 with auth_error when cv_ai_key_scrimba cookie is missing", async () => {
      const req = createRequest(
        "POST",
        "http://localhost:3000/api/ai/video",
        {
          repositoryFullName: "facebook/react",
          messageId: "msg-1",
          prompt: "Explain architecture",
          answerText: "Architecture overview",
        },
        false, // no cookie
      );

      const res = await POST(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.fallbackNotice?.code).toBe("auth_error");
      expect(data.fallbackNotice?.suggestedAction).toBe("open_keys");
    });

    it("forwards request to Scrimba API with Bearer token and returns HTTP 202 on success", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({
          id: "job-scrimba-99",
          status: "queued",
          durationSeconds: 30,
          scenes: [
            {
              title: "Intro",
              narration: "Start here",
              targetNodeIds: ["file-1"],
            },
          ],
        }),
      } as unknown as Response);
      global.fetch = fetchMock;

      const req = createRequest("POST", "http://localhost:3000/api/ai/video", {
        repositoryFullName: "facebook/react",
        messageId: "msg-123",
        prompt: "Walkthrough React core",
        answerText: "React reconciler and fiber details",
        targetDurationSeconds: 30,
      });

      const res = await POST(req);
      expect(res.status).toBe(202);

      const data = await res.json();
      expect(data.jobId).toBe("job-scrimba-99");
      expect(data.status).toBe("queued");
      expect(data.durationSeconds).toBe(30);

      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.scrimba.com/api/v1/explainers",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: `Bearer ${secretKey}`,
          }),
        }),
      );
    });

    it("returns 400 when repositoryFullName or prompt is invalid", async () => {
      const req = createRequest("POST", "http://localhost:3000/api/ai/video", {
        repositoryFullName: "",
        messageId: "msg-123",
        prompt: "",
        answerText: "Short text",
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toMatch(/invalid request payload/i);
    });

    it("returns 502 with sanitized message when upstream Scrimba returns an error", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "Internal rendering engine failure",
      } as unknown as Response);

      const req = createRequest("POST", "http://localhost:3000/api/ai/video", {
        repositoryFullName: "facebook/react",
        messageId: "msg-123",
        prompt: "Walkthrough React",
        answerText: "React architecture explanation",
      });

      const res = await POST(req);
      expect(res.status).toBe(502);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.fallbackNotice?.code).toBe("provider_outage");
    });
  });

  describe("GET /api/ai/video/[jobId]", () => {
    it("returns 401 when cv_ai_key_scrimba cookie is missing", async () => {
      const req = createRequest(
        "GET",
        "http://localhost:3000/api/ai/video/job-valid-123",
        undefined,
        false, // no cookie
      );
      const res = await GET_JOB(req, {
        params: Promise.resolve({ jobId: "job-valid-123" }),
      });
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.fallbackNotice?.code).toBe("auth_error");
      expect(data.fallbackNotice?.suggestedAction).toBe("open_keys");
    });

    it("rejects path traversal or malicious jobId with HTTP 400", async () => {
      const req = createRequest(
        "GET",
        "http://localhost:3000/api/ai/video/../../etc/passwd",
      );
      const res = await GET_JOB(req, {
        params: Promise.resolve({ jobId: "../../etc/passwd" }),
      });
      expect(res.status).toBe(400);
    });

    it("returns 200 with complete status when upstream completes with allowed video origin", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: "job-valid-123",
          status: "complete",
          videoUrl: "https://cdn.scrimba.com/videos/job-valid-123.mp4",
          durationSeconds: 28,
          scenes: [],
        }),
      } as unknown as Response);

      const req = createRequest(
        "GET",
        "http://localhost:3000/api/ai/video/job-valid-123",
      );
      const res = await GET_JOB(req, {
        params: Promise.resolve({ jobId: "job-valid-123" }),
      });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.status).toBe("complete");
      expect(data.videoUri).toBe(
        "https://cdn.scrimba.com/videos/job-valid-123.mp4",
      );
      expect(data.durationSeconds).toBe(28);
    });

    it("rejects untrusted video URL origins from upstream with HTTP 502", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: "job-evil-123",
          status: "complete",
          videoUrl: "https://attacker-video-site.com/evil.mp4",
          durationSeconds: 30,
        }),
      } as unknown as Response);

      const req = createRequest(
        "GET",
        "http://localhost:3000/api/ai/video/job-evil-123",
      );
      const res = await GET_JOB(req, {
        params: Promise.resolve({ jobId: "job-evil-123" }),
      });
      expect(res.status).toBe(502);
    });

    it("returns 200 with polling status while upstream job is still in progress", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: "job-poll-123",
          status: "queued",
          durationSeconds: 30,
          scenes: [],
        }),
      } as unknown as Response);

      const req = createRequest(
        "GET",
        "http://localhost:3000/api/ai/video/job-poll-123",
      );
      const res = await GET_JOB(req, {
        params: Promise.resolve({ jobId: "job-poll-123" }),
      });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.status).toBe("polling");
      expect(data.videoUri).toBeNull();
    });

    it("returns 200 with failed status and errorNotice when upstream reports failure", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: "job-failed-123",
          status: "failed",
          error: "Rendering timeout occurred",
          durationSeconds: 30,
        }),
      } as unknown as Response);

      const req = createRequest(
        "GET",
        "http://localhost:3000/api/ai/video/job-failed-123",
      );
      const res = await GET_JOB(req, {
        params: Promise.resolve({ jobId: "job-failed-123" }),
      });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.status).toBe("failed");
      expect(data.videoUri).toBeNull();
      expect(data.errorNotice).toBeDefined();
    });

    it("forwards 429 rate limit with Retry-After header when upstream is throttled", async () => {
      const headers = new Headers();
      headers.set("retry-after", "25");
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        headers,
        text: async () => "Rate limit exceeded",
      } as unknown as Response);

      const req = createRequest(
        "GET",
        "http://localhost:3000/api/ai/video/job-throttle-123",
      );
      const res = await GET_JOB(req, {
        params: Promise.resolve({ jobId: "job-throttle-123" }),
      });
      expect(res.status).toBe(429);
      expect(res.headers.get("retry-after")).toBe("25");
      const data = await res.json();
      expect(data.fallbackNotice?.code).toBe("rate_limit");
    });

    it("returns 404 when upstream job is not found", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => "Not found",
      } as unknown as Response);

      const req = createRequest(
        "GET",
        "http://localhost:3000/api/ai/video/job-missing-123",
      );
      const res = await GET_JOB(req, {
        params: Promise.resolve({ jobId: "job-missing-123" }),
      });
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe("Walkthrough job not found.");
    });

    it("returns 502 with fallback notice when upstream fetch throws network error", async () => {
      global.fetch = vi
        .fn()
        .mockRejectedValue(new Error("Connection reset by peer"));

      const req = createRequest(
        "GET",
        "http://localhost:3000/api/ai/video/job-net-error-123",
      );
      const res = await GET_JOB(req, {
        params: Promise.resolve({ jobId: "job-net-error-123" }),
      });
      expect(res.status).toBe(502);
      const data = await res.json();
      expect(data.fallbackNotice?.suggestedAction).toBe("retry");
    });
  });
});
