import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { LayoutWorkerClient } from "../layout-worker-client";
import { executeLayoutComputation } from "../layout-computation";
import type { CodebaseGraph } from "@/entities";
import {
  createWorkerSuccessResponse,
  createWorkerErrorResponse,
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
      totalFiles: 2,
      totalSymbols: 0,
      languages: { typescript: 2 },
      schemaVersion: 1,
    },
    directories: {
      "dir:src": {
        id: "dir:src",
        path: "src",
        name: "src",
        parentDirId: null,
        childDirIds: [],
        childFileIds: ["file:src/a.ts", "file:src/b.ts"],
      },
    },
    files: {
      "file:src/a.ts": {
        id: "file:src/a.ts",
        path: "src/a.ts",
        name: "a.ts",
        extension: ".ts",
        language: "typescript",
        sizeBytes: 100,
        lineCount: 10,
        directoryId: "dir:src",
        symbolIds: [],
        importIds: [],
        exportIds: [],
      },
      "file:src/b.ts": {
        id: "file:src/b.ts",
        path: "src/b.ts",
        name: "b.ts",
        extension: ".ts",
        language: "typescript",
        sizeBytes: 150,
        lineCount: 15,
        directoryId: "dir:src",
        symbolIds: [],
        importIds: [],
        exportIds: [],
      },
    },
    symbols: {},
    externalModules: {},
    edges: {
      "edge:a->b": {
        id: "edge:a->b",
        sourceId: "file:src/a.ts",
        targetId: "file:src/b.ts",
        kind: "file_import",
        weight: 1,
        isExternal: false,
      },
    },
  };
}

describe("LayoutWorkerClient", () => {
  const originalWorker = globalThis.Worker;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    // Restore global Worker
    if (originalWorker) {
      globalThis.Worker = originalWorker;
    } else {
      delete (globalThis as Record<string, unknown>).Worker;
    }
  });

  describe("AC-5: Synchronous fallback in test / non-worker environments", () => {
    it("executes synchronous Dagre layout computation when Worker is undefined", async () => {
      // Ensure Worker is undefined
      delete (globalThis as Record<string, unknown>).Worker;

      const client = new LayoutWorkerClient();
      const mockGraph = createMockGraph();
      const filters = {
        selectedLayers: [],
        collapsedFolderIds: [],
        searchQuery: "",
        hideExternal: false,
      };

      const result = await client.computeLayout({
        graph: mockGraph,
        filters,
        options: { direction: "LR" },
      });

      const expected = executeLayoutComputation(mockGraph, filters, {
        direction: "LR",
      });

      expect(result.nodes.length).toBe(expected.nodes.length);
      expect(result.edges.length).toBe(expected.edges.length);
      expect(result.nodes[0]?.id).toBe(expected.nodes[0]?.id);
      expect(result.nodes[0]?.position).toEqual(expected.nodes[0]?.position);
    });
  });

  describe("AC-3: Busy worker termination and monotonic request tracking", () => {
    it("terminates busy worker when a newer request arrives and resolves latest", async () => {
      const createdWorkers: MockWorker[] = [];
      const terminatedWorkers: MockWorker[] = [];

      class MockWorker {
        public onmessage:
          ((event: MessageEvent<LayoutWorkerResponse>) => void) | null = null;
        public onerror: ((event: ErrorEvent) => void) | null = null;
        public postedMessages: LayoutWorkerRequest[] = [];
        public isTerminated = false;

        public postMessage(msg: LayoutWorkerRequest): void {
          this.postedMessages.push(msg);
        }

        public terminate(): void {
          this.isTerminated = true;
          terminatedWorkers.push(this);
        }
      }

      // Mock global Worker
      (globalThis as unknown as Record<string, unknown>).Worker = MockWorker;

      const client = new LayoutWorkerClient(() => {
        const instance = new MockWorker();
        createdWorkers.push(instance);
        return instance as unknown as Worker;
      });
      const mockGraph = createMockGraph();
      const filters = {
        selectedLayers: [],
        collapsedFolderIds: [],
        searchQuery: "",
        hideExternal: false,
      };

      // Issue first request (does not respond immediately)
      const promise1 = client.computeLayout({
        graph: mockGraph,
        filters,
        options: { direction: "LR" },
      });

      const firstWorker = createdWorkers[0]!;
      expect(client.isBusy).toBe(true);
      expect(firstWorker.postedMessages.length).toBe(1);
      const firstRequestId = firstWorker.postedMessages[0]?.id;

      // Issue second request while first is still computing
      const promise2 = client.computeLayout({
        graph: mockGraph,
        filters: { ...filters, searchQuery: "b" },
        options: { direction: "LR" },
      });

      // First promise must reject with SUPERSEDED error
      await expect(promise1).rejects.toMatchObject({
        code: "SUPERSEDED",
        message: expect.stringContaining("superseded"),
      });

      // First worker must have been terminated
      expect(firstWorker.isTerminated).toBe(true);

      // Second worker was instantiated and received the second request
      const secondWorker = createdWorkers[1]!;
      expect(secondWorker).not.toBe(firstWorker);
      expect(secondWorker.postedMessages.length).toBe(1);
      const secondRequestId = secondWorker.postedMessages[0]?.id;
      expect(secondRequestId).not.toBe(firstRequestId);

      // Simulate worker completing second request successfully
      const successPayload = {
        nodes: [],
        edges: [],
        durationMs: 15,
      };
      secondWorker.onmessage?.({
        data: createWorkerSuccessResponse(secondRequestId!, successPayload),
      } as unknown as MessageEvent<LayoutWorkerResponse>);

      const result2 = await promise2;
      expect(result2).toEqual(successPayload);
      expect(client.isBusy).toBe(false);
    });
  });

  describe("AC-6: 5000ms timeout guard", () => {
    it("terminates worker and rejects with TIMEOUT if computation exceeds 5000ms", async () => {
      vi.useFakeTimers();

      class MockWorker {
        public onmessage:
          ((event: MessageEvent<LayoutWorkerResponse>) => void) | null = null;
        public onerror: ((event: ErrorEvent) => void) | null = null;
        public isTerminated = false;

        public postMessage(): void {}

        public terminate(): void {
          this.isTerminated = true;
        }
      }

      (globalThis as unknown as Record<string, unknown>).Worker = MockWorker;

      let workerInstance: MockWorker | null = null;
      const client = new LayoutWorkerClient(() => {
        workerInstance = new MockWorker();
        return workerInstance as unknown as Worker;
      });

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const mockGraph = createMockGraph();
      const layoutPromise = client.computeLayout({
        graph: mockGraph,
        filters: {
          selectedLayers: [],
          collapsedFolderIds: [],
          searchQuery: "",
          hideExternal: false,
        },
        options: { direction: "LR" },
      });

      expect(client.isBusy).toBe(true);

      // Fast-forward time past the 5000ms timeout
      vi.advanceTimersByTime(5001);

      await expect(layoutPromise).rejects.toMatchObject({
        code: "TIMEOUT",
        message: expect.stringContaining("5000ms"),
      });

      expect(workerInstance!.isTerminated).toBe(true);
      expect(client.isBusy).toBe(false);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("timed out after 5000ms"),
      );

      vi.useRealTimers();
    });

    it("terminates and rejects with INTERNAL_ERROR if worker triggers onerror", async () => {
      class MockWorker {
        public onmessage:
          ((event: MessageEvent<LayoutWorkerResponse>) => void) | null = null;
        public onerror: ((event: ErrorEvent) => void) | null = null;
        public isTerminated = false;

        public postMessage(): void {}

        public terminate(): void {
          this.isTerminated = true;
        }
      }

      (globalThis as unknown as Record<string, unknown>).Worker = MockWorker;

      let workerInstance: MockWorker | null = null;
      const client = new LayoutWorkerClient(() => {
        workerInstance = new MockWorker();
        return workerInstance as unknown as Worker;
      });

      vi.spyOn(console, "warn").mockImplementation(() => {});

      const mockGraph = createMockGraph();
      const layoutPromise = client.computeLayout({
        graph: mockGraph,
        filters: {
          selectedLayers: [],
          collapsedFolderIds: [],
          searchQuery: "",
          hideExternal: false,
        },
        options: { direction: "LR" },
      });

      // Simulate worker crash event
      workerInstance!.onerror?.({
        message: "Out of memory",
      } as unknown as ErrorEvent);

      await expect(layoutPromise).rejects.toMatchObject({
        code: "INTERNAL_ERROR",
        message: "Out of memory",
      });

      expect(workerInstance!.isTerminated).toBe(true);
      expect(client.isBusy).toBe(false);
    });

    it("rejects with LAYOUT_FAILED when worker responds with error envelope", async () => {
      class MockWorker {
        public onmessage:
          ((event: MessageEvent<LayoutWorkerResponse>) => void) | null = null;
        public onerror: ((event: ErrorEvent) => void) | null = null;
        public isTerminated = false;
        public lastRequestId: string | null = null;

        public postMessage(msg: LayoutWorkerRequest): void {
          this.lastRequestId = msg.id;
        }

        public terminate(): void {
          this.isTerminated = true;
        }
      }

      (globalThis as unknown as Record<string, unknown>).Worker = MockWorker;

      let workerInstance: MockWorker | null = null;
      const client = new LayoutWorkerClient(() => {
        workerInstance = new MockWorker();
        return workerInstance as unknown as Worker;
      });

      const mockGraph = createMockGraph();
      const layoutPromise = client.computeLayout({
        graph: mockGraph,
        filters: {
          selectedLayers: [],
          collapsedFolderIds: [],
          searchQuery: "",
          hideExternal: false,
        },
        options: { direction: "LR" },
      });

      workerInstance!.onmessage?.({
        data: createWorkerErrorResponse(
          workerInstance!.lastRequestId!,
          "LAYOUT_FAILED",
          "Graph cycle detected in Dagre rank assignment",
        ),
      } as unknown as MessageEvent<LayoutWorkerResponse>);

      await expect(layoutPromise).rejects.toMatchObject({
        code: "LAYOUT_FAILED",
        message: "Graph cycle detected in Dagre rank assignment",
      });

      expect(client.isBusy).toBe(false);
    });
  });
});
