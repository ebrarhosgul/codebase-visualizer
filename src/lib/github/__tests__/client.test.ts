import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchRepoMetadata, fetchTarballArchive } from "../client";

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
});
