import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  useAsyncGraphLayout,
  LAYOUT_DEBOUNCE_MS,
} from "../use-async-graph-layout";
import { useGraphStore } from "@/stores/graph-store";
import type { CodebaseGraph } from "@/entities";
import {
  createWorkerSuccessResponse,
  type LayoutWorkerRequest,
  type LayoutWorkerResponse,
} from "@/lib/workers/worker-types";

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

describe("useAsyncGraphLayout", () => {
  const originalWorker = globalThis.Worker;

  beforeEach(() => {
    useGraphStore.getState().reset();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (originalWorker) {
      globalThis.Worker = originalWorker;
    } else {
      delete (globalThis as Record<string, unknown>).Worker;
    }
  });

  it("calculates layout synchronously in test fallback mode (AC-5)", () => {
    delete (globalThis as Record<string, unknown>).Worker;

    const mockGraph = createMockGraph();
    const filters = {
      selectedLayers: [],
      collapsedFolderIds: [],
      searchQuery: "",
      hideExternal: false,
    };

    const { result } = renderHook(() =>
      useAsyncGraphLayout(mockGraph, filters),
    );

    expect(result.current.isCalculating).toBe(false);
    expect(result.current.error).toBe(null);
    expect(result.current.nodes.some((n) => n.id === "file:src/index.ts")).toBe(
      true,
    );
  });

  it("coordinates off-thread calculation with debouncing and retains existing nodes (AC-3, AC-4)", async () => {
    vi.useFakeTimers();

    let postedMessage: LayoutWorkerRequest | null = null;
    let workerOnMessage:
      ((event: MessageEvent<LayoutWorkerResponse>) => void) | null = null;

    class MockWorker {
      constructor() {
        // capture onmessage assignment
      }
      public set onmessage(
        fn: (event: MessageEvent<LayoutWorkerResponse>) => void,
      ) {
        workerOnMessage = fn;
      }
      public postMessage(msg: LayoutWorkerRequest): void {
        postedMessage = msg;
      }
      public terminate(): void {}
    }

    (globalThis as unknown as Record<string, unknown>).Worker = MockWorker;

    const mockGraph = createMockGraph();
    let filters = {
      selectedLayers: [],
      collapsedFolderIds: [],
      searchQuery: "",
      hideExternal: false,
    };

    const { result, rerender } = renderHook(
      ({ f }) => useAsyncGraphLayout(mockGraph, f),
      { initialProps: { f: filters } },
    );

    // Initial render computes fallback sync
    expect(result.current.nodes.length).toBeGreaterThan(0);
    const initialNodeId = result.current.nodes[0]?.id;

    // Trigger filter update
    filters = { ...filters, searchQuery: "new-token" };
    rerender({ f: filters });

    // Should indicate calculating while retaining previous nodes
    expect(result.current.isCalculating).toBe(true);
    expect(result.current.nodes[0]?.id).toBe(initialNodeId);

    // Advance timers by debounce duration
    await act(async () => {
      vi.advanceTimersByTime(LAYOUT_DEBOUNCE_MS);
    });

    expect(postedMessage).not.toBeNull();
    const reqId = (postedMessage as unknown as LayoutWorkerRequest).id;

    // Simulate worker responding with new nodes
    await act(async () => {
      workerOnMessage?.({
        data: createWorkerSuccessResponse(reqId, {
          nodes: [
            {
              id: "file:src/updated.ts",
              type: "file",
              position: { x: 10, y: 20 },
              data: { label: "updated" },
            },
          ],
          edges: [],
          durationMs: 12,
        }),
      } as unknown as MessageEvent<LayoutWorkerResponse>);
    });

    expect(result.current.isCalculating).toBe(false);
    expect(result.current.nodes[0]?.id).toBe("file:src/updated.ts");
    expect(useGraphStore.getState().isCalculatingLayout).toBe(false);

    vi.useRealTimers();
  });

  it("guards against state updates after unmount", () => {
    delete (globalThis as Record<string, unknown>).Worker;

    const mockGraph = createMockGraph();
    const filters = {
      selectedLayers: [],
      collapsedFolderIds: [],
      searchQuery: "",
      hideExternal: false,
    };

    const { unmount } = renderHook(() =>
      useAsyncGraphLayout(mockGraph, filters),
    );

    expect(() => unmount()).not.toThrow();
  });
});
