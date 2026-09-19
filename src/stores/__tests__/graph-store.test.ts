import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { useGraphStore } from "../graph-store";
import type { CodebaseGraph } from "@/entities";
import * as storage from "@/lib/storage";

vi.mock("@/lib/storage", async () => {
  const actual = await vi.importActual<typeof storage>("@/lib/storage");
  return {
    ...actual,
    getCachedRepository: vi.fn().mockResolvedValue(null),
    saveCachedRepository: vi.fn().mockResolvedValue(null),
  };
});

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

  it("clears activeTarget and selection when target symbol is not found (AC-6)", () => {
    useGraphStore.getState().bufferDeepLink({
      repo: "org/repo",
      file: "src/valid.ts",
      symbol: "missingFunc",
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
        totalFiles: 1,
        totalSymbols: 0,
        languages: {},
        schemaVersion: 1,
      },
      directories: {},
      files: {
        "file:src/valid.ts": {
          id: "file:src/valid.ts",
          path: "src/valid.ts",
          name: "valid.ts",
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
    } as unknown as CodebaseGraph;

    useGraphStore.getState().setGraph(mockGraph);

    const state = useGraphStore.getState();
    expect(state.pendingTarget).toBeNull();
    expect(state.activeTarget).toBeNull();
    expect(state.selectedNodeId).toBeNull();
    expect(state.selectedFileId).toBeNull();
    expect(state.fallbackNotification).toContain("missingFunc");
  });

  it("permits consecutive cursor movements in editor without artificial self-lockout (AC-3)", () => {
    // 1. Move cursor to line 10
    useGraphStore.getState().navigateToTarget({
      fileId: "file:src/test.ts",
      line: 10,
      source: "editor",
      timestamp: Date.now(),
    });
    expect(useGraphStore.getState().activeTarget?.line).toBe(10);

    // 2. Immediately move cursor to line 11 (should succeed, not be locked out)
    useGraphStore.getState().navigateToTarget({
      fileId: "file:src/test.ts",
      line: 11,
      source: "editor",
      timestamp: Date.now() + 50,
    });
    expect(useGraphStore.getState().activeTarget?.line).toBe(11);
  });

  it("checks navigation lock status with isNavigationLocked helper (AC-4)", () => {
    expect(useGraphStore.getState().isNavigationLocked()).toBe(false);

    // Set lock in the future
    useGraphStore.setState({ lockedUntil: Date.now() + 500 });
    expect(useGraphStore.getState().isNavigationLocked()).toBe(true);

    // Expire time lock but coordinate guard still matches lastProgrammaticTarget
    useGraphStore.setState({
      lockedUntil: 0,
      lastProgrammaticTarget: { fileId: "file:src/app.ts", line: 42 },
    });

    // Matching coordinates return locked
    expect(
      useGraphStore.getState().isNavigationLocked("file:src/app.ts", 42),
    ).toBe(true);

    // Different line returns unlocked
    expect(
      useGraphStore.getState().isNavigationLocked("file:src/app.ts", 99),
    ).toBe(false);

    // Different file returns unlocked
    expect(
      useGraphStore.getState().isNavigationLocked("file:src/other.ts", 42),
    ).toBe(false);
  });

  it("handles bufferDeepLink edge cases with invalid lines and empty parameters (AC-1, AC-6)", () => {
    // Both file and symbol empty -> should not set pendingTarget
    useGraphStore.getState().bufferDeepLink({});
    expect(useGraphStore.getState().pendingTarget).toBeNull();

    // Malformed non numeric line numbers
    useGraphStore.getState().bufferDeepLink({
      file: "src/index.ts",
      line: "not-a-number",
    });
    expect(useGraphStore.getState().pendingTarget?.line).toBeNull();

    // Negative line numbers
    useGraphStore.getState().bufferDeepLink({
      file: "src/index.ts",
      line: "-5",
    });
    expect(useGraphStore.getState().pendingTarget?.line).toBeNull();

    // Zero line number
    useGraphStore.getState().bufferDeepLink({
      file: "src/index.ts",
      line: "0",
    });
    expect(useGraphStore.getState().pendingTarget?.line).toBeNull();
  });

  it("returns success immediately when flushing empty pending target (AC-7)", () => {
    const result = useGraphStore.getState().flushPendingDeepLink();
    expect(result.success).toBe(true);
  });

  it("handles pure file navigation without line or symbol coordinates (AC-2)", () => {
    useGraphStore.getState().navigateToTarget({
      fileId: "file:src/standalone.ts",
      source: "canvas",
      timestamp: Date.now(),
    });

    const state = useGraphStore.getState();
    expect(state.activeTarget?.fileId).toBe("file:src/standalone.ts");
    expect(state.activeTarget?.line).toBeUndefined();
    expect(state.activeTarget?.symbolId).toBeUndefined();
    expect(state.selectedFileId).toBe("file:src/standalone.ts");
    expect(state.selectedNodeId).toBe("file:src/standalone.ts");
    expect(state.lastProgrammaticTarget).toBeNull();
  });

  it("toggles, sets, and clears architectural layer filters", () => {
    const store = useGraphStore.getState();
    expect(store.selectedLayers).toEqual([]);

    store.toggleLayerFilter("components");
    expect(useGraphStore.getState().selectedLayers).toEqual(["components"]);

    store.toggleLayerFilter("stores");
    expect(useGraphStore.getState().selectedLayers).toEqual([
      "components",
      "stores",
    ]);

    store.toggleLayerFilter("components");
    expect(useGraphStore.getState().selectedLayers).toEqual(["stores"]);

    store.setLayerFilters(["api", "utils"]);
    expect(useGraphStore.getState().selectedLayers).toEqual(["api", "utils"]);

    store.clearLayerFilters();
    expect(useGraphStore.getState().selectedLayers).toEqual([]);
  });

  it("toggles, collapses, and expands folders", () => {
    const store = useGraphStore.getState();
    expect(store.collapsedFolderIds).toEqual([]);

    store.toggleFolderCollapse("src/components");
    expect(useGraphStore.getState().collapsedFolderIds).toEqual([
      "src/components",
    ]);

    store.toggleFolderCollapse("src/components");
    expect(useGraphStore.getState().collapsedFolderIds).toEqual([]);

    store.expandAllFolders();
    expect(useGraphStore.getState().collapsedFolderIds).toEqual([]);
  });

  it("sets search query, toggles external, and resets all filters", () => {
    const store = useGraphStore.getState();
    store.setSearchQuery("Button");
    store.toggleHideExternal();
    store.setLayerFilters(["components"]);
    store.toggleFolderCollapse("src/components");

    let state = useGraphStore.getState();
    expect(state.searchQuery).toBe("Button");
    expect(state.hideExternal).toBe(true);
    expect(state.selectedLayers).toEqual(["components"]);
    expect(state.collapsedFolderIds).toEqual(["src/components"]);

    store.resetAllFilters();
    state = useGraphStore.getState();
    expect(state.searchQuery).toBe("");
    expect(state.hideExternal).toBe(false);
    expect(state.selectedLayers).toEqual([]);
    expect(state.collapsedFolderIds).toEqual([]);
  });

  it("reveals hidden node by uncollapsing folders, adding layer, and clearing search (AC-9)", () => {
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
        totalFiles: 2,
        totalSymbols: 1,
        languages: { typescript: 1 },
        schemaVersion: 1,
      },
      directories: {},
      files: {
        "file:src/components/modal.tsx": {
          id: "file:src/components/modal.tsx",
          path: "src/components/modal.tsx",
          name: "modal.tsx",
          extension: ".tsx",
          language: "typescript",
          sizeBytes: 500,
          lineCount: 20,
          directoryId: "dir:src/components",
          symbolIds: ["symbol:modal"],
          importIds: [],
          exportIds: [],
        },
      },
      symbols: {
        "symbol:modal": {
          id: "symbol:modal",
          fileId: "file:src/components/modal.tsx",
          parentSymbolId: null,
          name: "Modal",
          kind: "function",
          range: {
            startLine: 5,
            startColumn: 1,
            endLine: 15,
            endColumn: 1,
            startOffset: 50,
            endOffset: 150,
          },
          selectionRange: {
            startLine: 5,
            startColumn: 10,
            endLine: 5,
            endColumn: 15,
            startOffset: 59,
            endOffset: 64,
          },
          isExported: true,
          isDefaultExport: false,
          signature: "function Modal()",
          documentation: null,
          visibility: "public",
          childSymbolIds: [],
        },
      },
      externalModules: {
        "ext:lodash": {
          id: "ext:lodash",
          name: "lodash",
          isStdLib: false,
          symbolIds: [],
        },
      },
      edges: {},
    } as unknown as CodebaseGraph;

    useGraphStore.getState().setGraph(mockGraph);

    // Apply restrictive filters: layer 'utils', collapsed 'src/components', search 'unrelated', hideExternal true
    const store = useGraphStore.getState();
    store.setLayerFilters(["utils"]);
    store.toggleFolderCollapse("src/components");
    store.setSearchQuery("unrelated");
    store.toggleHideExternal();

    expect(useGraphStore.getState().selectedLayers).toEqual(["utils"]);
    expect(useGraphStore.getState().collapsedFolderIds).toEqual([
      "src/components",
    ]);
    expect(useGraphStore.getState().searchQuery).toBe("unrelated");
    expect(useGraphStore.getState().hideExternal).toBe(true);

    // Reveal symbol in modal.tsx
    store.revealNode("symbol:modal");

    const revealedState = useGraphStore.getState();
    // Components layer should be added to selectedLayers
    expect(revealedState.selectedLayers).toContain("components");
    // src/components should be uncollapsed
    expect(revealedState.collapsedFolderIds).not.toContain("src/components");
    // Search query should be cleared
    expect(revealedState.searchQuery).toBe("");
    // Node should be selected
    expect(revealedState.selectedNodeId).toBe("symbol:modal");

    // Reveal external module resets hideExternal
    store.revealNode("ext:lodash");
    expect(useGraphStore.getState().hideExternal).toBe(false);
  });

  it("sets activeTarget.source to tree and uncollapses parent folders when revealNode is called from tree", () => {
    const mockGraph = {
      schemaVersion: 1,
      repository: {
        id: "repo:org/app",
        owner: "org",
        name: "app",
        fullName: "org/app",
        defaultBranch: "main",
        commitSha: "sha1",
        analyzedAt: new Date().toISOString(),
        totalFiles: 1,
        totalSymbols: 0,
        languages: { typescript: 1 },
        schemaVersion: 1,
      },
      directories: {},
      files: {
        "file:src/components/button.tsx": {
          id: "file:src/components/button.tsx",
          path: "src/components/button.tsx",
          name: "button.tsx",
          extension: ".tsx",
          language: "typescript",
          sizeBytes: 100,
          lineCount: 10,
          directoryId: "dir:src/components",
          symbolIds: [],
          importIds: [],
          exportIds: [],
        },
      },
      symbols: {},
      externalModules: {},
      edges: {},
    } as unknown as CodebaseGraph;

    useGraphStore.getState().setGraph(mockGraph);
    useGraphStore.setState({
      collapsedFolderIds: ["src/components"],
      selectedLayers: ["utils"],
    });

    useGraphStore
      .getState()
      .revealNode("file:src/components/button.tsx", "tree");

    const state = useGraphStore.getState();
    expect(state.activeTarget?.source).toBe("tree");
    expect(state.activeTarget?.fileId).toBe("file:src/components/button.tsx");
    expect(state.collapsedFolderIds).not.toContain("src/components");
    expect(state.selectedLayers).toContain("components");
  });

  it("automatically uncollapses parent folders and reveals layers when navigateToTarget is called from editor", () => {
    const mockGraph = {
      schemaVersion: 1,
      repository: {
        id: "repo:org/app",
        owner: "org",
        name: "app",
        fullName: "org/app",
        defaultBranch: "main",
        commitSha: "sha1",
        analyzedAt: new Date().toISOString(),
        totalFiles: 1,
        totalSymbols: 0,
        languages: { typescript: 1 },
        schemaVersion: 1,
      },
      directories: {},
      files: {
        "file:src/services/api.ts": {
          id: "file:src/services/api.ts",
          path: "src/services/api.ts",
          name: "api.ts",
          extension: ".ts",
          language: "typescript",
          sizeBytes: 150,
          lineCount: 20,
          directoryId: "dir:src/services",
          symbolIds: [],
          importIds: [],
          exportIds: [],
        },
      },
      symbols: {},
      externalModules: {},
      edges: {},
    } as unknown as CodebaseGraph;

    useGraphStore.getState().setGraph(mockGraph);
    useGraphStore.setState({
      collapsedFolderIds: ["src/services"],
      selectedLayers: ["components"],
    });

    useGraphStore.getState().navigateToTarget({
      fileId: "file:src/services/api.ts",
      source: "editor",
      timestamp: Date.now(),
    });

    const state = useGraphStore.getState();
    expect(state.collapsedFolderIds).not.toContain("src/services");
    expect(state.selectedLayers).toContain("lib");
    expect(state.selectedFileId).toBe("file:src/services/api.ts");
  });

  it("manages active trace state and focused trace steps (covers: AC-5)", () => {
    const mockTrace = {
      id: "trace:file:a.ts->file:c.ts",
      sourceNodeId: "file:a.ts",
      targetNodeId: "file:c.ts",
      stepNodeIds: ["file:a.ts", "file:b.ts", "file:c.ts"],
      stepEdgeIds: ["edge:a->b", "edge:b->c"],
      hopCount: 2,
      rationale: "Import chain",
      createdAt: new Date().toISOString(),
    };

    const store = useGraphStore.getState();
    store.setActiveTrace(mockTrace);

    const activeState = useGraphStore.getState();
    expect(activeState.activeTrace).toEqual(mockTrace);
    expect(activeState.activeStepIndex).toBeNull();
    expect(activeState.highlightedNodeIds).toEqual(mockTrace.stepNodeIds);
    expect(activeState.highlightedEdgeIds).toEqual(mockTrace.stepEdgeIds);

    // Focus step 1 ("file:b.ts")
    store.focusTraceStep(1);
    expect(useGraphStore.getState().activeStepIndex).toBe(1);
    expect(useGraphStore.getState().selectedNodeId).toBe("file:b.ts");

    // Invalid step index resets activeStepIndex
    store.focusTraceStep(99);
    expect(useGraphStore.getState().activeStepIndex).toBeNull();

    // Negative step index resets activeStepIndex
    store.focusTraceStep(-1);
    expect(useGraphStore.getState().activeStepIndex).toBeNull();

    // Setting active trace to null clears trace state
    store.setActiveTrace(mockTrace);
    expect(useGraphStore.getState().activeTrace).not.toBeNull();
    store.setActiveTrace(null);
    expect(useGraphStore.getState().activeTrace).toBeNull();
    expect(useGraphStore.getState().highlightedNodeIds).toEqual([]);
    expect(useGraphStore.getState().highlightedEdgeIds).toEqual([]);

    // Clear trace
    store.setActiveTrace(mockTrace);
    store.clearTrace();
    const clearedState = useGraphStore.getState();
    expect(clearedState.activeTrace).toBeNull();
    expect(clearedState.activeStepIndex).toBeNull();
    expect(clearedState.highlightedNodeIds).toEqual([]);
    expect(clearedState.highlightedEdgeIds).toEqual([]);

    // Store reset also wipes active trace state
    store.setActiveTrace(mockTrace);
    store.reset();
    expect(useGraphStore.getState().activeTrace).toBeNull();
    expect(useGraphStore.getState().highlightedNodeIds).toEqual([]);
  });

  it("hydrates from client IndexedDB cache on cache_hit SSE event (covers: AC-1, AC-2)", async () => {
    const cachedGraph = {
      schemaVersion: 1,
      repository: {
        id: "repo:cached/repo",
        owner: "cached",
        name: "repo",
        fullName: "cached/repo",
        defaultBranch: "main",
        commitSha: "sha-cached-123",
        analyzedAt: new Date().toISOString(),
        totalFiles: 5,
        totalSymbols: 2,
        languages: { typescript: 5 },
        schemaVersion: 1,
      },
      directories: {},
      files: {},
      symbols: {},
      externalModules: {},
      edges: {},
    } as unknown as CodebaseGraph;

    vi.mocked(storage.getCachedRepository).mockResolvedValue({
      id: "cached/repo:main",
      repoKey: "cached/repo",
      owner: "cached",
      repo: "repo",
      branch: "main",
      commitSha: "sha-cached-123",
      schemaVersion: 1,
      graph: cachedGraph,
      fileSources: { "file:index.ts": "export const cached = true;" },
      nodeCount: 5,
      edgeCount: 2,
      fileCount: 1,
      byteSize: 500,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
    });

    const sseChunk =
      'data: {"phase":"complete","cached":true,"commitSha":"sha-cached-123","message":"Repository is up to date"}\n\n';

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(sseChunk));
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
      repositoryUrl: "https://github.com/cached/repo",
    });

    const state = useGraphStore.getState();
    expect(state.isIngesting).toBe(false);
    expect(state.ingestionPhase).toBe("complete");
    expect(state.isCacheHit).toBe(true);
    expect(state.offlineFallback).toBe(false);
    expect(state.repository?.fullName).toBe("cached/repo");
    expect(state.fileSources["file:index.ts"]).toBe(
      "export const cached = true;",
    );
  });

  it("falls back to local offline cache when network request fails (covers: AC-8)", async () => {
    const cachedGraph = {
      schemaVersion: 1,
      repository: {
        id: "repo:offline/repo",
        owner: "offline",
        name: "repo",
        fullName: "offline/repo",
        defaultBranch: "main",
        commitSha: "offline-sha",
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

    vi.mocked(storage.getCachedRepository).mockResolvedValue({
      id: "offline/repo:main",
      repoKey: "offline/repo",
      owner: "offline",
      repo: "repo",
      branch: "main",
      commitSha: "offline-sha",
      schemaVersion: 1,
      graph: cachedGraph,
      fileSources: { "file:app.ts": "const offline = true;" },
      nodeCount: 1,
      edgeCount: 0,
      fileCount: 1,
      byteSize: 300,
      createdAt: 1000,
      lastAccessedAt: 2000,
    });

    // Simulate network disconnection
    global.fetch = vi.fn().mockRejectedValue(new Error("Failed to fetch"));

    await useGraphStore.getState().startIngestion({
      repositoryUrl: "https://github.com/offline/repo",
    });

    const state = useGraphStore.getState();
    expect(state.isIngesting).toBe(false);
    expect(state.ingestionPhase).toBe("complete");
    expect(state.isCacheHit).toBe(true);
    expect(state.offlineFallback).toBe(true);
    expect(state.offlineLastSynced).toBe(2000);
    expect(state.repository?.fullName).toBe("offline/repo");
  });

  it("opens rate limit recovery modal on 403 / 429 response (covers: AC-6)", async () => {
    vi.mocked(storage.getCachedRepository).mockResolvedValue(null);

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        code: "RATE_LIMITED",
        message: "API rate limit exceeded.",
        rateLimitReset: 1725310000,
      }),
    } as unknown as Response);

    await useGraphStore.getState().startIngestion({
      repositoryUrl: "https://github.com/ratelimit/repo",
    });

    const state = useGraphStore.getState();
    expect(state.rateLimitModalOpen).toBe(true);
    expect(state.rateLimitReset).toBe(1725310000);
    expect(state.pendingRateLimitedRequest?.repositoryUrl).toBe(
      "https://github.com/ratelimit/repo",
    );

    // Can close modal
    useGraphStore.getState().setRateLimitModalOpen(false);
    expect(useGraphStore.getState().rateLimitModalOpen).toBe(false);
  });

  it("forceReingest bypasses cache with forceFresh: true (covers: AC-3)", async () => {
    useGraphStore.setState({
      repository: {
        id: "repo:facebook/react",
        owner: "facebook",
        name: "react",
        fullName: "facebook/react",
        defaultBranch: "main",
        commitSha: "sha-1",
        analyzedAt: new Date().toISOString(),
        totalFiles: 1,
        totalSymbols: 0,
        languages: {},
        schemaVersion: 1,
      },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "Content-Type": "text/event-stream" }),
      body: new ReadableStream({
        start(controller) {
          controller.close();
        },
      }),
    } as unknown as Response);

    await useGraphStore.getState().forceReingest();

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/ingest",
      expect.objectContaining({
        body: expect.stringContaining('"forceFresh":true'),
      }),
    );
  });

  it("migrates legacy sessionStorage token to httpOnly cookie endpoint (covers: AC-5)", async () => {
    sessionStorage.setItem("github_pat", "ghp_legacy_token_1234567890");

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, maskedToken: "ghp_...7890" }),
    } as unknown as Response);

    await useGraphStore.getState().migrateLegacyToken();

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/auth/github-token",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ token: "ghp_legacy_token_1234567890" }),
      }),
    );
    expect(sessionStorage.getItem("github_pat")).toBeNull();
    expect(useGraphStore.getState().hasGithubToken).toBe(true);
  });

  it("checks token status via GET /api/auth/github-token (covers: AC-5)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ hasToken: true, maskedToken: "ghp_...1234" }),
    } as unknown as Response);

    await useGraphStore.getState().checkTokenStatus();
    expect(useGraphStore.getState().hasGithubToken).toBe(true);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ hasToken: false, maskedToken: null }),
    } as unknown as Response);

    await useGraphStore.getState().checkTokenStatus();
    expect(useGraphStore.getState().hasGithubToken).toBe(false);
  });

  it("clears token via DELETE /api/auth/github-token (covers: AC-5)", async () => {
    useGraphStore.setState({ hasGithubToken: true });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    } as unknown as Response);

    await useGraphStore.getState().clearGithubToken();

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/auth/github-token",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(useGraphStore.getState().hasGithubToken).toBe(false);
  });

  it("retryAfterRateLimit closes modal and restarts pending request (covers: AC-6)", async () => {
    const pendingRequest = {
      repositoryUrl: "https://github.com/retry/repo",
      branch: "main",
    };

    useGraphStore.setState({
      rateLimitModalOpen: true,
      pendingRateLimitedRequest: pendingRequest,
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "Content-Type": "text/event-stream" }),
      body: new ReadableStream({
        start(controller) {
          controller.close();
        },
      }),
    } as unknown as Response);

    await useGraphStore.getState().retryAfterRateLimit();

    expect(useGraphStore.getState().rateLimitModalOpen).toBe(false);
    expect(useGraphStore.getState().pendingRateLimitedRequest).toBeNull();
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/ingest",
      expect.objectContaining({
        body: expect.stringContaining("https://github.com/retry/repo"),
      }),
    );
  });

  it("updates ingestionProgress with granular details during streaming (covers: AC-4)", async () => {
    const sseChunk =
      'data: {"phase":"parsing_ast","progress":{"phase":"parsing_ast","current":70,"total":100,"message":"Parsing AST...","detail":{"currentItem":5,"totalItems":10,"currentItemName":"src/main.ts"}}}\n\n';

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(sseChunk));
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
      repositoryUrl: "https://github.com/progress/repo",
    });

    const progress = useGraphStore.getState().ingestionProgress;
    expect(progress?.detail?.currentItem).toBe(5);
    expect(progress?.detail?.totalItems).toBe(10);
    expect(progress?.detail?.currentItemName).toBe("src/main.ts");
  });

  describe("answer highlight (0013 zero friction demo mode)", () => {
    const fakeTrace = {
      sourceNodeId: "file:a",
      targetNodeId: "file:b",
      stepNodeIds: ["file:a", "file:b"],
      stepEdgeIds: ["edge:a->b"],
      hopCount: 1,
    } as unknown as import("@/entities").PathTrace;

    it("starts with no highlight, no source, and no visible file ids (covers: AC-6)", () => {
      const state = useGraphStore.getState();

      expect(state.highlightedNodeIds).toEqual([]);
      expect(state.highlightSource).toBeNull();
      expect(state.visibleFileIds).toEqual([]);
    });

    it("setAnswerHighlight stores the ids and marks the source as answer (covers: AC-6)", () => {
      useGraphStore.getState().setAnswerHighlight(["file:a", "file:b"]);

      const state = useGraphStore.getState();
      expect(state.highlightedNodeIds).toEqual(["file:a", "file:b"]);
      expect(state.highlightSource).toBe("answer");
    });

    it("setAnswerHighlight leaves edges untouched by emptying highlighted edge ids (covers: AC-6)", () => {
      useGraphStore.getState().setActiveTrace(fakeTrace);
      expect(useGraphStore.getState().highlightedEdgeIds).toEqual([
        "edge:a->b",
      ]);

      useGraphStore.getState().setAnswerHighlight(["file:c"]);

      expect(useGraphStore.getState().highlightedEdgeIds).toEqual([]);
    });

    it("setAnswerHighlight clears an active trace so only one highlight shows at a time (covers: AC-6)", () => {
      useGraphStore.getState().setActiveTrace(fakeTrace);

      useGraphStore.getState().setAnswerHighlight(["file:c"]);

      const state = useGraphStore.getState();
      expect(state.activeTrace).toBeNull();
      expect(state.activeStepIndex).toBeNull();
      expect(state.highlightSource).toBe("answer");
    });

    it("setActiveTrace replaces an answer highlight and marks the source as trace (covers: AC-6)", () => {
      useGraphStore.getState().setAnswerHighlight(["file:c"]);

      useGraphStore.getState().setActiveTrace(fakeTrace);

      const state = useGraphStore.getState();
      expect(state.highlightSource).toBe("trace");
      expect(state.highlightedNodeIds).toEqual(["file:a", "file:b"]);
    });

    it("setActiveTrace(null) clears the highlight and its source (covers: AC-6)", () => {
      useGraphStore.getState().setAnswerHighlight(["file:c"]);

      useGraphStore.getState().setActiveTrace(null);

      const state = useGraphStore.getState();
      expect(state.highlightedNodeIds).toEqual([]);
      expect(state.highlightSource).toBeNull();
    });

    it("clearTrace clears an answer highlight (covers: AC-6, AC-12)", () => {
      useGraphStore.getState().setAnswerHighlight(["file:a"]);

      useGraphStore.getState().clearTrace();

      const state = useGraphStore.getState();
      expect(state.highlightedNodeIds).toEqual([]);
      expect(state.highlightSource).toBeNull();
    });

    it("selecting a node on the canvas clears an answer highlight (covers: AC-6)", () => {
      useGraphStore.getState().setAnswerHighlight(["file:a", "file:b"]);

      useGraphStore.getState().selectNode("file:a");

      const state = useGraphStore.getState();
      expect(state.highlightedNodeIds).toEqual([]);
      expect(state.highlightSource).toBeNull();
      expect(state.selectedNodeId).toBe("file:a");
    });

    it("deselecting with a null node also clears an answer highlight (covers: AC-6)", () => {
      useGraphStore.getState().setAnswerHighlight(["file:a"]);

      useGraphStore.getState().selectNode(null);

      expect(useGraphStore.getState().highlightSource).toBeNull();
      expect(useGraphStore.getState().highlightedNodeIds).toEqual([]);
    });

    it("navigateToTarget clears an answer highlight (covers: AC-6)", () => {
      useGraphStore.getState().setAnswerHighlight(["file:a"]);

      useGraphStore.getState().navigateToTarget({
        fileId: "file:a",
        line: 1,
        source: "canvas",
        timestamp: Date.now(),
      });

      const state = useGraphStore.getState();
      expect(state.highlightedNodeIds).toEqual([]);
      expect(state.highlightSource).toBeNull();
    });

    it("selecting a node keeps an active trace highlight untouched (covers: AC-6)", () => {
      useGraphStore.getState().setActiveTrace(fakeTrace);

      useGraphStore.getState().selectNode("file:a");

      const state = useGraphStore.getState();
      expect(state.highlightSource).toBe("trace");
      expect(state.highlightedNodeIds).toEqual(["file:a", "file:b"]);
    });

    it("setGraph resets an answer highlight and visible file ids so nothing survives a repository change (covers: AC-6, AC-12)", () => {
      useGraphStore.getState().setAnswerHighlight(["file:a"]);
      useGraphStore.getState().setVisibleFileIds(["file:a", "file:b"]);
      const nextGraph = {
        schemaVersion: 1,
        repository: {
          id: "repo:other/repo",
          owner: "other",
          name: "repo",
          fullName: "other/repo",
          defaultBranch: "main",
          commitSha: "sha2",
          analyzedAt: "2026-01-01T00:00:00.000Z",
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

      useGraphStore.getState().setGraph(nextGraph);

      const state = useGraphStore.getState();
      expect(state.highlightedNodeIds).toEqual([]);
      expect(state.highlightSource).toBeNull();
      expect(state.visibleFileIds).toEqual([]);
    });

    it("stores and replaces visible file ids without touching the highlight (covers: AC-7)", () => {
      useGraphStore.getState().setAnswerHighlight(["file:a"]);

      useGraphStore.getState().setVisibleFileIds(["file:a", "file:b"]);
      expect(useGraphStore.getState().visibleFileIds).toEqual([
        "file:a",
        "file:b",
      ]);

      useGraphStore.getState().setVisibleFileIds(["file:b"]);
      expect(useGraphStore.getState().visibleFileIds).toEqual(["file:b"]);
      expect(useGraphStore.getState().highlightSource).toBe("answer");
    });

    it("copies input arrays so later caller mutation cannot change store state (covers: AC-6)", () => {
      const ids = ["file:a", "file:b"];

      useGraphStore.getState().setAnswerHighlight(ids);
      ids.push("file:evil");

      expect(useGraphStore.getState().highlightedNodeIds).toEqual([
        "file:a",
        "file:b",
      ]);
    });

    it("never holds highlighted ids while highlight source is null across the whole lifecycle (covers: AC-6)", () => {
      const assertInvariant = () => {
        const state = useGraphStore.getState();
        if (state.highlightSource === null) {
          expect(state.highlightedNodeIds).toEqual([]);
        }
      };

      assertInvariant();
      useGraphStore.getState().setAnswerHighlight(["file:a"]);
      assertInvariant();
      useGraphStore.getState().setActiveTrace(fakeTrace);
      assertInvariant();
      useGraphStore.getState().setAnswerHighlight(["file:b"]);
      assertInvariant();
      useGraphStore.getState().selectNode("file:b");
      assertInvariant();
      useGraphStore.getState().setActiveTrace(fakeTrace);
      useGraphStore.getState().clearTrace();
      assertInvariant();
    });
  });

  describe("setLayoutCalculationState", () => {
    it("updates layout calculation status and duration metric", () => {
      expect(useGraphStore.getState().isCalculatingLayout).toBe(false);
      expect(useGraphStore.getState().layoutDurationMs).toBeNull();

      useGraphStore.getState().setLayoutCalculationState(true);
      expect(useGraphStore.getState().isCalculatingLayout).toBe(true);
      expect(useGraphStore.getState().layoutDurationMs).toBeNull();

      useGraphStore.getState().setLayoutCalculationState(false, 38);
      expect(useGraphStore.getState().isCalculatingLayout).toBe(false);
      expect(useGraphStore.getState().layoutDurationMs).toBe(38);

      useGraphStore.getState().setLayoutCalculationState(true);
      expect(useGraphStore.getState().isCalculatingLayout).toBe(true);
      expect(useGraphStore.getState().layoutDurationMs).toBe(38);

      useGraphStore.getState().reset();
      expect(useGraphStore.getState().isCalculatingLayout).toBe(false);
      expect(useGraphStore.getState().layoutDurationMs).toBeNull();
    });
  });
});
