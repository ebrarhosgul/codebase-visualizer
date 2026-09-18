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
  createWorkerErrorResponse,
  type LayoutWorkerRequest,
  type LayoutWorkerResponse,
} from "@/lib/workers/worker-types";

import { layoutWorkerClient } from "@/graph/layout/layout-worker-client";

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
    layoutWorkerClient.terminate();
    useGraphStore.getState().reset();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    layoutWorkerClient.terminate();
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

  it("surfaces calculation error while preserving existing nodes and edges (AC-4, AC-6)", async () => {
    vi.useFakeTimers();

    let postedMessage: LayoutWorkerRequest | null = null;
    let workerOnMessage:
      ((event: MessageEvent<LayoutWorkerResponse>) => void) | null = null;

    class MockWorker {
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

    const initialNodes = result.current.nodes;
    expect(initialNodes.length).toBeGreaterThan(0);

    // Trigger filter change
    filters = { ...filters, searchQuery: "failing-query" };
    rerender({ f: filters });

    await act(async () => {
      vi.advanceTimersByTime(LAYOUT_DEBOUNCE_MS);
    });

    const reqId = (postedMessage as unknown as LayoutWorkerRequest).id;

    // Simulate worker returning a LAYOUT_FAILED error
    await act(async () => {
      workerOnMessage?.({
        data: createWorkerErrorResponse(
          reqId,
          "LAYOUT_FAILED",
          "Layout calculation failed inside worker",
        ),
      } as unknown as MessageEvent<LayoutWorkerResponse>);
    });

    // Error is surfaced, calculating flag is cleared, and previous nodes remain visible
    expect(result.current.isCalculating).toBe(false);
    expect(result.current.error).not.toBeNull();
    expect(result.current.error?.code).toBe("LAYOUT_FAILED");
    expect(result.current.error?.message).toContain(
      "Layout calculation failed",
    );
    expect(result.current.nodes).toBe(initialNodes);
    expect(useGraphStore.getState().isCalculatingLayout).toBe(false);

    vi.useRealTimers();
  });

  it("debounces rapid successive filter updates to execute only once for latest state (AC-3)", async () => {
    vi.useFakeTimers();

    const postMessageSpy = vi.fn();

    class MockWorker {
      public set onmessage(
        _fn: (event: MessageEvent<LayoutWorkerResponse>) => void,
      ) {}
      public postMessage(msg: LayoutWorkerRequest): void {
        postMessageSpy(msg);
      }
      public terminate(): void {}
    }

    (globalThis as unknown as Record<string, unknown>).Worker = MockWorker;

    const mockGraph = createMockGraph();
    const filters = {
      selectedLayers: [],
      collapsedFolderIds: [],
      searchQuery: "",
      hideExternal: false,
    };

    const { rerender } = renderHook(
      ({ f }) => useAsyncGraphLayout(mockGraph, f),
      { initialProps: { f: filters } },
    );

    // Rapid updates before debounce completes
    rerender({ f: { ...filters, searchQuery: "a" } });
    vi.advanceTimersByTime(20);
    rerender({ f: { ...filters, searchQuery: "ab" } });
    vi.advanceTimersByTime(20);
    rerender({ f: { ...filters, searchQuery: "abc" } });

    // Advance past the full 50ms window from the last update
    await act(async () => {
      vi.advanceTimersByTime(LAYOUT_DEBOUNCE_MS);
    });

    // Only the final debounced request should have been dispatched
    expect(postMessageSpy).toHaveBeenCalledTimes(1);
    const lastRequest = postMessageSpy.mock
      .calls[0]?.[0] as LayoutWorkerRequest;
    expect(lastRequest.payload.filters.searchQuery).toBe("abc");

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
