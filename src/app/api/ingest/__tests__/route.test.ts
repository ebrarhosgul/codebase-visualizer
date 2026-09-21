import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../route";
import * as github from "@/lib/github";
import { encryptGithubToken } from "@/lib/github/crypto";
import { resetRateLimits } from "@/lib/ai/rate-limiter";
import * as parser from "@/lib/parser";

vi.mock("@/lib/github", async () => {
  const actual = await vi.importActual<typeof github>("@/lib/github");
  return {
    ...actual,
    fetchRepoMetadata: vi.fn(),
    fetchBranchCommitSha: vi.fn(),
    fetchTarballArchive: vi.fn(),
  };
});

vi.mock("@/lib/parser", async () => {
  const actual = await vi.importActual<typeof parser>("@/lib/parser");
  return {
    ...actual,
    unpackRepositoryTarball: vi.fn(),
    parseRepositoryAst: vi.fn(),
  };
});

describe("POST /api/ingest route handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimits();
  });

  it("returns 400 when request body is invalid JSON", async () => {
    const req = new NextRequest("http://localhost:3000/api/ingest", {
      method: "POST",
      body: "not-json",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { code: string };
    expect(json.code).toBe("INVALID_URL");
  });

  it("streams SSE error event when repository URL is invalid", async () => {
    const req = new NextRequest("http://localhost:3000/api/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repositoryUrl: "invalid-url" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");

    const text = await res.text();
    expect(text).toContain('"phase":"validating"');
    expect(text).toContain('"phase":"error"');
    expect(text).toContain('"code":"INVALID_URL"');
  });

  it("streams cache_hit event and terminates immediately when commit hash matches (covers: AC-2)", async () => {
    vi.mocked(github.fetchRepoMetadata).mockResolvedValue({
      success: true,
      data: {
        owner: "antigravity",
        name: "test-repo",
        fullName: "antigravity/test-repo",
        defaultBranch: "main",
        commitSha: "commit-sha-40-chars-1234567890abcdef1234",
      },
    });

    vi.mocked(github.fetchBranchCommitSha).mockResolvedValue({
      success: true,
      data: "commit-sha-40-chars-1234567890abcdef1234",
    });

    const req = new NextRequest("http://localhost:3000/api/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        repositoryUrl: "https://github.com/antigravity/test-repo",
        cachedCommitSha: "commit-sha-40-chars-1234567890abcdef1234",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const text = await res.text();
    expect(text).toContain('"cached":true');
    expect(text).toContain(
      '"commitSha":"commit-sha-40-chars-1234567890abcdef1234"',
    );
    // Archive should not be downloaded when cache hits (AC-2, zero bytes downloaded)
    expect(github.fetchTarballArchive).not.toHaveBeenCalled();
  });

  it("bypasses cache hit when forceFresh is true (covers: AC-3)", async () => {
    vi.mocked(github.fetchRepoMetadata).mockResolvedValue({
      success: true,
      data: {
        owner: "antigravity",
        name: "test-repo",
        fullName: "antigravity/test-repo",
        defaultBranch: "main",
        commitSha: "sha123",
      },
    });

    vi.mocked(github.fetchBranchCommitSha).mockResolvedValue({
      success: true,
      data: "sha123",
    });

    vi.mocked(github.fetchTarballArchive).mockResolvedValue({
      success: true,
      data: new ArrayBuffer(10),
    });

    vi.mocked(parser.unpackRepositoryTarball).mockResolvedValue({
      files: [
        {
          path: "src/index.ts",
          content: 'export const hello = "world";',
          sizeBytes: 30,
        },
      ],
      totalFilesFound: 1,
      wasCapped: false,
    });

    vi.mocked(parser.parseRepositoryAst).mockReturnValue({
      graph: {
        schemaVersion: 1,
        repository: {
          id: "repo:antigravity/test-repo",
          owner: "antigravity",
          name: "test-repo",
          fullName: "antigravity/test-repo",
          defaultBranch: "main",
          commitSha: "sha123",
          analyzedAt: new Date().toISOString(),
          totalFiles: 1,
          totalSymbols: 0,
          languages: { typescript: 1 },
          schemaVersion: 1,
        },
        directories: {},
        files: {},
        symbols: {},
        externalModules: {},
        edges: {},
      },
      fileSources: {
        "file:src/index.ts": 'export const hello = "world";',
      },
    });

    const req = new NextRequest("http://localhost:3000/api/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        repositoryUrl: "https://github.com/antigravity/test-repo",
        cachedCommitSha: "sha123",
        forceFresh: true,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const text = await res.text();
    // fetchTarballArchive SHOULD have been called because forceFresh was true
    expect(github.fetchTarballArchive).toHaveBeenCalled();
    expect(text).toContain('"phase":"complete"');
    expect(text).not.toContain('"cached":true');
  });

  it("reads token from encrypted httpOnly cookie (covers: AC-5)", async () => {
    const rawToken = "ghp_secure_cookie_token_1234567890";
    const encrypted = encryptGithubToken(rawToken);

    vi.mocked(github.fetchRepoMetadata).mockResolvedValue({
      success: true,
      data: {
        owner: "antigravity",
        name: "test-repo",
        fullName: "antigravity/test-repo",
        defaultBranch: "main",
        commitSha: "sha123",
      },
    });

    vi.mocked(github.fetchBranchCommitSha).mockResolvedValue({
      success: true,
      data: "sha123",
    });

    vi.mocked(github.fetchTarballArchive).mockResolvedValue({
      success: true,
      data: new ArrayBuffer(10),
    });

    vi.mocked(parser.unpackRepositoryTarball).mockResolvedValue({
      files: [],
      totalFilesFound: 0,
      wasCapped: false,
    });

    const req = new NextRequest("http://localhost:3000/api/ingest", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `${github.GITHUB_PAT_COOKIE_NAME}=${encrypted}`,
      },
      body: JSON.stringify({
        repositoryUrl: "https://github.com/antigravity/test-repo",
      }),
    });

    await POST(req);

    // fetchRepoMetadata should receive decrypted token
    expect(github.fetchRepoMetadata).toHaveBeenCalledWith(
      "antigravity",
      "test-repo",
      expect.objectContaining({
        token: rawToken,
      }),
    );
  });

  it("streams error event when branch commit SHA check is rate limited (covers: AC-2, AC-6)", async () => {
    vi.mocked(github.fetchRepoMetadata).mockResolvedValue({
      success: true,
      data: {
        owner: "antigravity",
        name: "test-repo",
        fullName: "antigravity/test-repo",
        defaultBranch: "main",
        commitSha: "sha123",
      },
    });

    vi.mocked(github.fetchBranchCommitSha).mockResolvedValue({
      success: false,
      error: {
        code: "RATE_LIMITED",
        message: "GitHub rate limit exceeded during commit verification.",
        rateLimitReset: 1725300000,
      },
    });

    const req = new NextRequest("http://localhost:3000/api/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        repositoryUrl: "https://github.com/antigravity/test-repo",
        cachedCommitSha: "sha123",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const text = await res.text();
    expect(text).toContain('"phase":"error"');
    expect(text).toContain('"code":"RATE_LIMITED"');
    expect(text).toContain('"rateLimitReset":1725300000');
  });

  it("streams error event when no source files are found in archive (covers: AC-4)", async () => {
    vi.mocked(github.fetchRepoMetadata).mockResolvedValue({
      success: true,
      data: {
        owner: "antigravity",
        name: "test-repo",
        fullName: "antigravity/test-repo",
        defaultBranch: "main",
        commitSha: "sha-fresh",
      },
    });

    vi.mocked(github.fetchBranchCommitSha).mockResolvedValue({
      success: true,
      data: "sha-fresh",
    });

    vi.mocked(github.fetchTarballArchive).mockResolvedValue({
      success: true,
      data: new ArrayBuffer(10),
    });

    vi.mocked(parser.unpackRepositoryTarball).mockResolvedValue({
      files: [],
      totalFilesFound: 0,
      wasCapped: false,
    });

    const req = new NextRequest("http://localhost:3000/api/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        repositoryUrl: "https://github.com/antigravity/test-repo",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const text = await res.text();
    expect(text).toContain('"phase":"error"');
    expect(text).toContain('"code":"PARSE_FAILED"');
    expect(text).toContain("No TypeScript or JavaScript source files found");
  });
  describe("request hardening", () => {
    const ingestUrl = "http://localhost:3000/api/ingest";
    const invalidUrlBody = JSON.stringify({ repositoryUrl: "invalid-url" });

    it("refuses a cross site request", async () => {
      const req = new NextRequest(ingestUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://evil.example",
        },
        body: invalidUrlBody,
      });

      const res = await POST(req);
      expect(res.status).toBe(403);
    });

    it("rejects an oversized request body with 413", async () => {
      const req = new NextRequest(ingestUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repositoryUrl: "https://github.com/a/b",
          githubToken: "t".repeat(32 * 1024),
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(413);
    });

    it("rejects a body whose fields have the wrong types", async () => {
      const req = new NextRequest(ingestUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repositoryUrl: 42 }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("rate limits repeated ingestion from one client", async () => {
      const makeReq = () =>
        new NextRequest(ingestUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-forwarded-for": "203.0.113.50",
          },
          body: invalidUrlBody,
        });

      for (let i = 0; i < 10; i++) {
        const res = await POST(makeReq());
        expect(res.status).toBe(200);
        await res.text();
      }

      const blocked = await POST(makeReq());
      expect(blocked.status).toBe(429);
      expect(blocked.headers.get("Retry-After")).toBeTruthy();
      const json = (await blocked.json()) as { code: string };
      expect(json.code).toBe("TOO_MANY_REQUESTS");
    });

    it("rejects a branch of '..' before any GitHub request is made", async () => {
      const req = new NextRequest(ingestUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repositoryUrl: "https://github.com/owner/repo",
          branch: "..",
        }),
      });

      const res = await POST(req);
      const text = await res.text();
      expect(text).toContain('"code":"INVALID_URL"');
      expect(github.fetchRepoMetadata).not.toHaveBeenCalled();
      expect(github.fetchBranchCommitSha).not.toHaveBeenCalled();
      expect(github.fetchTarballArchive).not.toHaveBeenCalled();
    });

    it("does not pass any server GITHUB_TOKEN to GitHub for anonymous requests", async () => {
      vi.stubEnv("GITHUB_TOKEN", "ghp_operator_secret_must_not_leak_1234");
      try {
        vi.mocked(github.fetchRepoMetadata).mockResolvedValue({
          success: false,
          error: { code: "REPO_NOT_FOUND", message: "not found" },
        });

        const req = new NextRequest(ingestUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repositoryUrl: "https://github.com/o/r" }),
        });
        const res = await POST(req);
        await res.text();

        expect(github.fetchRepoMetadata).toHaveBeenCalledWith(
          "o",
          "r",
          expect.objectContaining({ token: undefined }),
        );
      } finally {
        vi.unstubAllEnvs();
      }
    });
  });
});
