import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../route";
import * as github from "@/lib/github";
import * as parser from "@/lib/parser";

vi.mock("@/lib/github", async () => {
  const actual = await vi.importActual<typeof github>("@/lib/github");
  return {
    ...actual,
    fetchRepoMetadata: vi.fn(),
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

  it("streams full SSE progression through complete phase", async () => {
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
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const text = await res.text();
    expect(text).toContain('"phase":"validating"');
    expect(text).toContain('"phase":"downloading_archive"');
    expect(text).toContain('"phase":"unpacking_files"');
    expect(text).toContain('"phase":"parsing_ast"');
    expect(text).toContain('"phase":"complete"');
    expect(text).toContain('"result":');
  });
});
