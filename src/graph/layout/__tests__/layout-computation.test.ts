import { describe, it, expect } from "vitest";
import {
  executeLayoutComputation,
  DEFAULT_LAYOUT_OPTIONS,
} from "../layout-computation";
import type { CodebaseGraph } from "@/entities";
import type { GraphFilterState } from "@/stores/graph-store";

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
        childFileIds: ["file:src/index.ts", "file:src/utils.ts"],
      },
    },
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
      "file:src/utils.ts": {
        id: "file:src/utils.ts",
        path: "src/utils.ts",
        name: "utils.ts",
        extension: ".ts",
        language: "typescript",
        sizeBytes: 80,
        lineCount: 8,
        directoryId: "dir:src",
        symbolIds: [],
        importIds: [],
        exportIds: [],
      },
    },
    symbols: {},
    externalModules: {},
    edges: {
      "edge:1": {
        id: "edge:1",
        sourceId: "file:src/index.ts",
        targetId: "file:src/utils.ts",
        kind: "file_import",
        weight: 1,
        isExternal: false,
      },
    },
  };
}

const defaultFilters: GraphFilterState = {
  selectedLayers: [],
  collapsedFolderIds: [],
  searchQuery: "",
  hideExternal: false,
};

describe("executeLayoutComputation", () => {
  it("computes positioned nodes and styled edges from a codebase graph (AC-1, AC-2)", () => {
    const graph = createMockGraph();
    const result = executeLayoutComputation(graph, defaultFilters);

    expect(result.nodes.length).toBeGreaterThan(0);
    expect(result.edges.length).toBe(1);
    expect(typeof result.durationMs).toBe("number");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);

    const firstEdge = result.edges[0];
    expect(firstEdge).toBeDefined();
    expect(firstEdge?.type).toBe("smoothstep");
    expect(firstEdge?.style?.stroke).toBe("#475569");
    expect(firstEdge?.style?.strokeWidth).toBe(1.5);
    expect(firstEdge?.markerEnd).toEqual({
      type: "arrowclosed",
      color: "#64748b",
      width: 12,
      height: 12,
    });
  });

  it("handles null or undefined graph safely without throwing", () => {
    const nullResult = executeLayoutComputation(null, defaultFilters);
    expect(nullResult.nodes).toEqual([]);
    expect(nullResult.edges).toEqual([]);
    expect(typeof nullResult.durationMs).toBe("number");

    const undefResult = executeLayoutComputation(undefined, defaultFilters);
    expect(undefResult.nodes).toEqual([]);
    expect(undefResult.edges).toEqual([]);
    expect(typeof undefResult.durationMs).toBe("number");
  });

  it("handles empty graph with zero files", () => {
    const emptyGraph: CodebaseGraph = {
      ...createMockGraph(),
      files: {},
      edges: {},
    };

    const result = executeLayoutComputation(emptyGraph, defaultFilters);
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
    expect(typeof result.durationMs).toBe("number");
  });

  it("filters elements according to search query token matching (AC-2)", () => {
    const graph = createMockGraph();
    const result = executeLayoutComputation(graph, {
      ...defaultFilters,
      searchQuery: "utils",
    });

    const fileNodes = result.nodes.filter((n) => n.type === "file");
    expect(fileNodes.some((n) => n.id === "file:src/utils.ts")).toBe(true);
    expect(fileNodes.some((n) => n.id === "file:src/index.ts")).toBe(false);
  });

  it("applies custom layout direction and dimension options", () => {
    const graph = createMockGraph();
    const tbResult = executeLayoutComputation(graph, defaultFilters, {
      ...DEFAULT_LAYOUT_OPTIONS,
      direction: "TB",
    });

    const lrResult = executeLayoutComputation(graph, defaultFilters, {
      ...DEFAULT_LAYOUT_OPTIONS,
      direction: "LR",
    });

    expect(tbResult.nodes.length).toBe(lrResult.nodes.length);
    const tbFileIndex = tbResult.nodes.find(
      (n) => n.id === "file:src/index.ts",
    );
    const lrFileIndex = lrResult.nodes.find(
      (n) => n.id === "file:src/index.ts",
    );
    expect(tbFileIndex).toBeDefined();
    expect(lrFileIndex).toBeDefined();
  });
});
