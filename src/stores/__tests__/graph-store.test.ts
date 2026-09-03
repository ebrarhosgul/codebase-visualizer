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
});
