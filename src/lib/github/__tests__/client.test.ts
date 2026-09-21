import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  MAX_ARCHIVE_DOWNLOAD_BYTES,
  fetchRepoMetadata,
  fetchTarballArchive,
} from "../client";

describe("github client", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("fetches repo metadata successfully", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        owner: { login: "vercel" },
        name: "next.js",
        full_name: "vercel/next.js",
        default_branch: "canary",
        description: "The React Framework",
      }),
    } as unknown as Response);

    const result = await fetchRepoMetadata("vercel", "next.js");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.defaultBranch).toBe("canary");
      expect(result.data.owner).toBe("vercel");
      expect(result.data.name).toBe("next.js");
    }
  });

  it("handles 404 repository not found", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      headers: new Headers(),
    } as unknown as Response);

    const result = await fetchRepoMetadata("nonexistent", "repo");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("REPO_NOT_FOUND");
    }
  });

  it("handles 403 rate limited response with reset timestamp (AC-9)", async () => {
    const headers = new Headers({
      "x-ratelimit-remaining": "0",
      "x-ratelimit-reset": "1725300000",
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: "Forbidden",
      headers,
    } as unknown as Response);

    const result = await fetchRepoMetadata("rate", "limited");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("RATE_LIMITED");
      expect(result.error.rateLimitReset).toBe(1725300000);
    }
  });

  it("fetches tarball archive buffer", async () => {
    const fakeBuffer = new Uint8Array([1, 2, 3]).buffer;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      arrayBuffer: async () => fakeBuffer,
    } as unknown as Response);

    const result = await fetchTarballArchive("owner", "repo", "main");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.byteLength).toBe(3);
    }
  });

  it("fetches branch commit SHA successfully (covers: AC-2)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        sha: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      }),
    } as unknown as Response);

    const { fetchBranchCommitSha } = await import("../client");
    const result = await fetchBranchCommitSha("owner", "repo", "main");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      );
    }
  });

  it("handles rate limits during branch commit SHA check (covers: AC-2, AC-6)", async () => {
    const headers = new Headers({
      "x-ratelimit-remaining": "0",
      "x-ratelimit-reset": "1725300000",
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: "Forbidden",
      headers,
    } as unknown as Response);

    const { fetchBranchCommitSha } = await import("../client");
    const result = await fetchBranchCommitSha("owner", "repo", "main");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("RATE_LIMITED");
      expect(result.error.rateLimitReset).toBe(1725300000);
    }
  });

  it("handles 404 branch not found during commit SHA check (covers: AC-2)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      headers: new Headers(),
    } as unknown as Response);

    const { fetchBranchCommitSha } = await import("../client");
    const result = await fetchBranchCommitSha(
      "owner",
      "repo",
      "missing-branch",
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("REPO_NOT_FOUND");
      expect(result.error.message).toContain("missing-branch");
    }
  });

  it("handles response missing sha property during commit SHA check (covers: AC-2)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({}),
    } as unknown as Response);

    const { fetchBranchCommitSha } = await import("../client");
    const result = await fetchBranchCommitSha("owner", "repo", "main");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("PARSE_FAILED");
    }
  });

  it("passes Authorization header when personal access token is provided (covers: AC-5)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ sha: "sha999" }),
    } as unknown as Response);

    const { fetchBranchCommitSha } = await import("../client");
    await fetchBranchCommitSha("owner", "repo", "main", {
      token: "ghp_customtoken1234567890",
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/commits/main"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer ghp_customtoken1234567890",
        }),
      }),
    );
  });
  it("never sends a server GITHUB_TOKEN on anonymous requests", async () => {
    vi.stubEnv("GITHUB_TOKEN", "ghp_operator_secret_must_not_leak_1234");
    try {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ default_branch: "main" }),
      } as unknown as Response);

      await fetchRepoMetadata("owner", "repo");

      const init = vi.mocked(global.fetch).mock.calls[0]?.[1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBeUndefined();
      expect(JSON.stringify(headers)).not.toContain("operator_secret");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("rejects an archive whose Content-Length exceeds the download cap", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        "content-length": String(MAX_ARCHIVE_DOWNLOAD_BYTES + 1),
      }),
      arrayBuffer: async () => new ArrayBuffer(3),
    } as unknown as Response);

    const result = await fetchTarballArchive("owner", "repo", "main");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("FILE_LIMIT_EXCEEDED");
    }
  });

  it("stops reading a streamed archive that outgrows the cap despite no Content-Length", async () => {
    const oversizedChunk = new Uint8Array(MAX_ARCHIVE_DOWNLOAD_BYTES / 2 + 1);
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        if (pulled > 10) {
          controller.close();
          return;
        }
        controller.enqueue(oversizedChunk);
      },
    });

    global.fetch = vi
      .fn()
      .mockResolvedValue(new Response(body, { status: 200 }));

    const result = await fetchTarballArchive("owner", "repo", "main");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("FILE_LIMIT_EXCEEDED");
    }
    // Aborted after two chunks rather than draining the whole stream
    expect(pulled).toBeLessThan(10);
  });

  it("downloads a streamed archive within the cap", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 }),
      );

    const result = await fetchTarballArchive("owner", "repo", "main");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(Array.from(new Uint8Array(result.data))).toEqual([1, 2, 3, 4]);
    }
  });
});
