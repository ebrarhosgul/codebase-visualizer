import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { useGraphStore } from "../graph-store";
import type { CodebaseGraph } from "@/entities";

describe("useGraphStore", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    useGraphStore.getState().reset();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("initializes with default state", () => {
    const state = useGraphStore.getState();
    expect(state.repository).toBeNull();
    expect(state.graph).toBeNull();
    expect(state.fileSources).toEqual({});
    expect(state.selectedNodeId).toBeNull();
    expect(state.selectedFileId).toBeNull();
    expect(state.ingestionPhase).toBe("idle");
    expect(state.isIngesting).toBe(false);
  });

  it("updates selected file ID when selecting file node", () => {
    useGraphStore.getState().selectNode("file:src/index.ts");
    expect(useGraphStore.getState().selectedNodeId).toBe("file:src/index.ts");
    expect(useGraphStore.getState().selectedFileId).toBe("file:src/index.ts");

    useGraphStore.getState().selectNode(null);
    expect(useGraphStore.getState().selectedNodeId).toBeNull();
    expect(useGraphStore.getState().selectedFileId).toBeNull();
  });

  it("manually sets graph and repository data", () => {
    const mockGraph = {
      schemaVersion: 1,
      repository: {
        id: "repo:test/repo",
        owner: "test",
        name: "repo",
        fullName: "test/repo",
        defaultBranch: "main",
        commitSha: "sha1",
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
    } as unknown as CodebaseGraph;

    useGraphStore
      .getState()
      .setGraph(mockGraph, { "file:src/index.ts": "const x = 1;" });

    const state = useGraphStore.getState();
    expect(state.graph).toBe(mockGraph);
    expect(state.repository?.id).toBe("repo:test/repo");
    expect(state.fileSources["file:src/index.ts"]).toBe("const x = 1;");
  });

  it("handles startIngestion stream events correctly", async () => {
    const sseChunks = [
      'data: {"phase":"validating","progress":{"phase":"validating","current":10,"total":100,"message":"Validating..."}}\n\n',
      'data: {"phase":"complete","progress":{"phase":"complete","current":100,"total":100,"message":"Done"},"result":{"repository":{"id":"repo:a/b","owner":"a","name":"b","fullName":"a/b","defaultBranch":"main","commitSha":"s","analyzedAt":"2026-01-01T00:00:00.000Z","totalFiles":1,"totalSymbols":0,"languages":{},"schemaVersion":1},"graph":{"schemaVersion":1,"repository":{"id":"repo:a/b","owner":"a","name":"b","fullName":"a/b","defaultBranch":"main","commitSha":"s","analyzedAt":"2026-01-01T00:00:00.000Z","totalFiles":1,"totalSymbols":0,"languages":{},"schemaVersion":1},"directories":{},"files":{},"symbols":{},"externalModules":{},"edges":{}},"fileSources":{"file:test.ts":"code"}}}\n\n',
    ];

    const stream = new ReadableStream({
      start(controller) {
        for (const chunk of sseChunks) {
          controller.enqueue(new TextEncoder().encode(chunk));
        }
        controller.close();
      },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "Content-Type": "text/event-stream" }),
      body: stream,
    } as unknown as Response);

    await useGraphStore.getState().startIngestion({
      repositoryUrl: "https://github.com/a/b",
    });

    const state = useGraphStore.getState();
    expect(state.isIngesting).toBe(false);
    expect(state.ingestionPhase).toBe("complete");
    expect(state.repository?.fullName).toBe("a/b");
    expect(state.fileSources["file:test.ts"]).toBe("code");
  });

  it("sets activeTarget and coordinates when navigateToTarget is called from canvas", () => {
    useGraphStore.getState().navigateToTarget({
      fileId: "file:src/app.ts",
      symbolId: "symbol:src/app.ts#startServer",
      line: 42,
      column: 5,
      source: "canvas",
      timestamp: Date.now(),
    });

    const state = useGraphStore.getState();
    expect(state.activeTarget?.fileId).toBe("file:src/app.ts");
    expect(state.activeTarget?.symbolId).toBe("symbol:src/app.ts#startServer");
    expect(state.activeTarget?.line).toBe(42);
    expect(state.selectedFileId).toBe("file:src/app.ts");
    expect(state.selectedNodeId).toBe("symbol:src/app.ts#startServer");
    expect(state.lastProgrammaticTarget).toEqual({
      fileId: "file:src/app.ts",
      line: 42,
    });
    expect(state.lockedUntil).toBeGreaterThan(Date.now() - 100);
  });

  it("suppresses reverse synchronization in navigateToTarget using dual guard (AC-4)", () => {
    // 1. Programmatic canvas navigation sets lock and lastProgrammaticTarget
    useGraphStore.getState().navigateToTarget({
      fileId: "file:src/app.ts",
      line: 50,
      source: "canvas",
      timestamp: Date.now(),
    });

    // 2. Immediate reverse navigation from editor to the exact same line is blocked
    useGraphStore.getState().navigateToTarget({
      fileId: "file:src/app.ts",
      line: 50,
      source: "editor",
      timestamp: Date.now(),
    });

    // Source remains canvas because editor event was suppressed by coordinate and time guard
    expect(useGraphStore.getState().activeTarget?.source).toBe("canvas");

    // 3. Reverse navigation to a different line while still time locked is also blocked
    useGraphStore.getState().navigateToTarget({
      fileId: "file:src/app.ts",
      line: 99,
      source: "editor",
      timestamp: Date.now(),
    });
    expect(useGraphStore.getState().activeTarget?.line).toBe(50);
  });

  it("buffers deep link and flushes when repository graph is loaded (AC-1, AC-7)", () => {
    useGraphStore.getState().bufferDeepLink({
      repo: "org/repo",
      file: "src/utils.ts",
      line: "15",
      symbol: "helper",
    });

    expect(useGraphStore.getState().pendingTarget).toEqual({
      fileId: "file:src/utils.ts",
      symbolId: "symbol:src/utils.ts#helper",
      line: 15,
      source: "url",
      timestamp: expect.any(Number),
    });

    // Mock graph with the target file and symbol
    const mockGraph = {
      schemaVersion: 1,
      repository: {
        id: "repo:org/repo",
        owner: "org",
        name: "repo",
        fullName: "org/repo",
        defaultBranch: "main",
        commitSha: "sha1",
        analyzedAt: new Date().toISOString(),
        totalFiles: 1,
        totalSymbols: 1,
        languages: { typescript: 1 },
        schemaVersion: 1,
      },
      directories: {},
      files: {
        "file:src/utils.ts": {
          id: "file:src/utils.ts",
          path: "src/utils.ts",
          name: "utils.ts",
          extension: ".ts",
          language: "typescript",
          sizeBytes: 100,
          lineCount: 20,
          directoryId: "dir:src",
          symbolIds: ["symbol:src/utils.ts#helper"],
          importIds: [],
          exportIds: [],
        },
      },
      symbols: {
        "symbol:src/utils.ts#helper": {
          id: "symbol:src/utils.ts#helper",
          fileId: "file:src/utils.ts",
          parentSymbolId: null,
          name: "helper",
          kind: "function",
          range: {
            startLine: 15,
            startColumn: 1,
            endLine: 20,
            endColumn: 1,
            startOffset: 100,
            endOffset: 200,
          },
          selectionRange: {
            startLine: 15,
            startColumn: 10,
            endLine: 15,
            endColumn: 16,
            startOffset: 109,
            endOffset: 115,
          },
          isExported: true,
          isDefaultExport: false,
          signature: "function helper()",
          documentation: null,
          visibility: "public",
          childSymbolIds: [],
        },
      },
      externalModules: {},
      edges: {},
    } as unknown as CodebaseGraph;

    // Setting graph triggers flushPendingDeepLink automatically
    useGraphStore.getState().setGraph(mockGraph);

    const state = useGraphStore.getState();
    expect(state.pendingTarget).toBeNull();
    expect(state.activeTarget?.fileId).toBe("file:src/utils.ts");
    expect(state.activeTarget?.symbolId).toBe("symbol:src/utils.ts#helper");
    expect(state.activeTarget?.line).toBe(15);
  });

  it("handles missing target gracefully during deep link flushing (AC-6)", () => {
    useGraphStore.getState().bufferDeepLink({
      repo: "org/repo",
      file: "non-existent.ts",
      line: "10",
    });

    const mockGraph = {
      schemaVersion: 1,
      repository: {
        id: "repo:org/repo",
        owner: "org",
        name: "repo",
        fullName: "org/repo",
        defaultBranch: "main",
        commitSha: "sha1",
        analyzedAt: new Date().toISOString(),
        totalFiles: 0,
        totalSymbols: 0,
        languages: {},
        schemaVersion: 1,
      },
      directories: {},
      files: {},
      symbols: {},
      externalModules: {},
      edges: {},
    } as unknown as CodebaseGraph;

    useGraphStore.getState().setGraph(mockGraph);

    const state = useGraphStore.getState();
    expect(state.pendingTarget).toBeNull();
    expect(state.activeTarget).toBeNull();
    expect(state.fallbackNotification).toContain("non-existent.ts");

    state.clearFallbackNotification();
    expect(useGraphStore.getState().fallbackNotification).toBeNull();
  });

  it("clears lastProgrammaticTarget when selecting a file node without line (AC-4)", () => {
    // Set an initial programmatic target with line
    useGraphStore.getState().navigateToTarget({
      fileId: "file:src/first.ts",
      line: 42,
      source: "canvas",
      timestamp: Date.now(),
    });
    expect(useGraphStore.getState().lastProgrammaticTarget).toEqual({
      fileId: "file:src/first.ts",
      line: 42,
    });

    // Selecting a file node directly resets lastProgrammaticTarget so coordinates do not stay locked
    useGraphStore.getState().selectNode("file:src/second.ts");
    expect(useGraphStore.getState().lastProgrammaticTarget).toBeNull();
  });
});
