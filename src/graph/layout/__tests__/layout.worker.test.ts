import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LayoutWorkerRequest } from "@/lib/workers/worker-types";
import type { CodebaseGraph } from "@/entities";

function createMockGraph(): CodebaseGraph {
  return {
    schemaVersion: 1,
    repository: {
      id: "repo:test/repo",
      owner: "test",
      name: "repo",
      fullName: "test/repo",
      defaultBranch: "main",
      commitSha: "abc",
      analyzedAt: new Date().toISOString(),
      totalFiles: 1,
      totalSymbols: 0,
      languages: { typescript: 1 },
      schemaVersion: 1,
    },
    directories: {},
    files: {
      "file:src/index.ts": {
        id: "file:src/index.ts",
        path: "src/index.ts",
        name: "index.ts",
        extension: ".ts",
        language: "typescript",
        sizeBytes: 100,
        lineCount: 10,
        directoryId: "dir:src",
        symbolIds: [],
        importIds: [],
        exportIds: [],
      },
    },
    symbols: {},
    externalModules: {},
    edges: {},
  };
}

describe("layout.worker message handler", () => {
  const postMessageMock = vi.fn();

  beforeEach(async () => {
    postMessageMock.mockClear();
    (globalThis as unknown as Record<string, unknown>).postMessage =
      postMessageMock;
    await import("../layout.worker");
  });

  it("processes valid layout request and posts success envelope (AC-1, AC-2)", () => {
    const mockRequest: LayoutWorkerRequest = {
      id: "req-1",
      type: "COMPUTE_LAYOUT",
      payload: {
        graph: createMockGraph(),
        filters: {
          selectedLayers: [],
          collapsedFolderIds: [],
          searchQuery: "",
          hideExternal: false,
        },
        options: { direction: "LR" },
      },
      timestamp: Date.now(),
    };

    const handler = (
      globalThis as unknown as { onmessage: (e: { data: unknown }) => void }
    ).onmessage;
    expect(handler).toBeDefined();

    handler({ data: mockRequest });

    expect(postMessageMock).toHaveBeenCalledTimes(1);
    const response = postMessageMock.mock.calls[0]?.[0];
    expect(response.id).toBe("req-1");
    expect(response.type).toBe("LAYOUT_SUCCESS");
    expect(response.payload.nodes.length).toBeGreaterThan(0);
    expect(typeof response.payload.durationMs).toBe("number");
  });

  it("posts INVALID_INPUT error envelope when graph or filter state is missing", () => {
    const malformedRequest = {
      id: "req-bad",
      type: "COMPUTE_LAYOUT",
      payload: null,
      timestamp: Date.now(),
    };

    const handler = (
      globalThis as unknown as { onmessage: (e: { data: unknown }) => void }
    ).onmessage;
    handler({ data: malformedRequest });

    expect(postMessageMock).toHaveBeenCalledTimes(1);
    const response = postMessageMock.mock.calls[0]?.[0];
    expect(response.id).toBe("req-bad");
    expect(response.type).toBe("LAYOUT_ERROR");
    expect(response.payload.code).toBe("INVALID_INPUT");
  });

  it("ignores messages with unrecognized request type", () => {
    const unknownRequest = {
      id: "req-other",
      type: "UNKNOWN_ACTION",
      payload: {},
      timestamp: Date.now(),
    };

    const handler = (
      globalThis as unknown as { onmessage: (e: { data: unknown }) => void }
    ).onmessage;
    handler({ data: unknownRequest });

    expect(postMessageMock).not.toHaveBeenCalled();
  });
});
