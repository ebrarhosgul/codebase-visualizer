import { describe, it, expect } from "vitest";
import { buildHeuristicIndex, getHeuristicIndex } from "../heuristic-index";
import {
  CURRENT_SCHEMA_VERSION,
  createGraphEdge,
  type CodebaseGraph,
  type FileNode,
  type GraphEdge,
} from "@/entities";

const mockRepo = {
  id: "repo:test",
  owner: "test-owner",
  name: "test-repo",
  fullName: "test-owner/test-repo",
  defaultBranch: "main",
  commitSha: "123456",
  analyzedAt: "2026-09-02T19:00:00.000Z",
  totalFiles: 4,
  totalSymbols: 4,
  languages: { TypeScript: 100 },
  schemaVersion: CURRENT_SCHEMA_VERSION,
};

function createMockFile(id: string, path: string): FileNode {
  return {
    id,
    path,
    name: path.split("/").pop() ?? path,
    extension: ".ts",
    language: "typescript",
    sizeBytes: 100,
    lineCount: 20,
    directoryId: "dir:src",
    symbolIds: [],
    importIds: [],
    exportIds: [],
  };
}

function createMockEdge(
  sourceId: string,
  targetId: string,
  kind: "file_import" | "re_export" | "call" = "file_import",
  isExternal = false,
): GraphEdge {
  return createGraphEdge({
    sourceId,
    targetId,
    kind,
    isExternal,
  });
}

function createGraph(
  files: Record<string, FileNode>,
  edges: Record<string, GraphEdge> = {},
): CodebaseGraph {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    repository: mockRepo,
    directories: {},
    files,
    symbols: {},
    externalModules: {},
    edges,
  };
}

describe("HeuristicIndex", () => {
  it("builds correct fan-in, fan-out, and layer allocations", () => {
    const files: Record<string, FileNode> = {
      "file:comp": createMockFile("file:comp", "src/components/Header.tsx"),
      "file:hook": createMockFile("file:hook", "src/hooks/useHeader.ts"),
      "file:store": createMockFile("file:store", "src/stores/header-store.ts"),
      "file:lib": createMockFile("file:lib", "src/lib/formatter.ts"),
    };

    const edges: Record<string, GraphEdge> = {
      e1: createMockEdge("file:comp", "file:hook"),
      e2: createMockEdge("file:hook", "file:store"),
      e3: createMockEdge("file:comp", "file:lib"),
    };

    const graph = createGraph(files, edges);

    const index = buildHeuristicIndex(graph);

    expect(index.fileCount).toBe(4);
    expect(index.internalEdgeCount).toBe(3);

    // Fan-in: comp=0, hook=1, store=1, lib=1
    expect(index.fanIn["file:comp"]).toBe(0);
    expect(index.fanIn["file:hook"]).toBe(1);
    expect(index.fanIn["file:store"]).toBe(1);
    expect(index.fanIn["file:lib"]).toBe(1);

    // Fan-out: comp=2, hook=1, store=0, lib=0
    expect(index.fanOut["file:comp"]).toBe(2);
    expect(index.fanOut["file:hook"]).toBe(1);
    expect(index.fanOut["file:store"]).toBe(0);
    expect(index.fanOut["file:lib"]).toBe(0);

    // Layers
    expect(index.layerByFile["file:comp"]).toBe("components");
    expect(index.layerByFile["file:hook"]).toBe("hooks");
    expect(index.layerByFile["file:store"]).toBe("stores");
    expect(index.layerByFile["file:lib"]).toBe("lib");

    expect(index.filesByLayer.components).toEqual(["file:comp"]);
    expect(index.filesByLayer.hooks).toEqual(["file:hook"]);
    expect(index.filesByLayer.stores).toEqual(["file:store"]);
    expect(index.filesByLayer.lib).toEqual(["file:lib"]);
    expect(index.filesByLayer.entities).toEqual([]);
  });

  it("deduplicates multiple edges between the same source and target files", () => {
    const files: Record<string, FileNode> = {
      "file:a": createMockFile("file:a", "src/components/A.tsx"),
      "file:b": createMockFile("file:b", "src/utils/B.ts"),
    };

    const edges: Record<string, GraphEdge> = {
      e1: createMockEdge("file:a", "file:b", "file_import"),
      e2: createMockEdge("file:a", "file:b", "re_export"),
    };

    const graph = createGraph(files, edges);

    const index = buildHeuristicIndex(graph);

    expect(index.internalEdgeCount).toBe(1);
    expect(index.fanOut["file:a"]).toBe(1);
    expect(index.fanIn["file:b"]).toBe(1);
    expect(index.layerMatrix.components.utils).toBe(1);
  });

  it("ignores external edges and non-import kinds", () => {
    const files: Record<string, FileNode> = {
      "file:a": createMockFile("file:a", "src/components/A.tsx"),
      "file:b": createMockFile("file:b", "src/utils/B.ts"),
    };

    const edges: Record<string, GraphEdge> = {
      e1: createMockEdge("file:a", "file:ext", "file_import", true),
      e2: createMockEdge("file:a", "file:b", "call"),
    };

    const graph = createGraph(files, edges);

    const index = buildHeuristicIndex(graph);

    expect(index.internalEdgeCount).toBe(0);
    expect(index.fanOut["file:a"]).toBe(0);
    expect(index.fanIn["file:b"]).toBe(0);
  });

  it("detects and sorts inverted architectural edges up to limit of 5", () => {
    // Inverted sources: entities, lib, utils, api
    // Inverted targets: components, hooks, stores, app
    const files: Record<string, FileNode> = {
      "file:util_z": createMockFile("file:util_z", "src/utils/z.ts"),
      "file:util_a": createMockFile("file:util_a", "src/utils/a.ts"),
      "file:lib_b": createMockFile("file:lib_b", "src/lib/b.ts"),
      "file:entity_c": createMockFile("file:entity_c", "src/entities/c.ts"),
      "file:api_d": createMockFile("file:api_d", "src/api/d.ts"),
      "file:lib_e": createMockFile("file:lib_e", "src/lib/e.ts"),
      "file:comp_target": createMockFile(
        "file:comp_target",
        "src/components/target.tsx",
      ),
    };

    const edges: Record<string, GraphEdge> = {
      e1: createMockEdge("file:util_z", "file:comp_target"),
      e2: createMockEdge("file:util_a", "file:comp_target"),
      e3: createMockEdge("file:lib_b", "file:comp_target"),
      e4: createMockEdge("file:entity_c", "file:comp_target"),
      e5: createMockEdge("file:api_d", "file:comp_target"),
      e6: createMockEdge("file:lib_e", "file:comp_target"),
    };

    const graph = createGraph(files, edges);

    const index = buildHeuristicIndex(graph);

    // Must be capped at 5
    expect(index.invertedEdges.length).toBe(5);

    // Sorted by source layer rank asc, then source path asc
    // Layer ranks: entities (4), lib (5), api (6), utils (7)
    // 1st: entities/c.ts
    // 2nd: lib/b.ts
    // 3rd: lib/e.ts
    // 4th: api/d.ts
    // 5th: utils/a.ts (a.ts < z.ts in codepoints)
    expect(index.invertedEdges[0].sourceId).toBe("file:entity_c");
    expect(index.invertedEdges[1].sourceId).toBe("file:lib_b");
    expect(index.invertedEdges[2].sourceId).toBe("file:lib_e");
    expect(index.invertedEdges[3].sourceId).toBe("file:api_d");
    expect(index.invertedEdges[4].sourceId).toBe("file:util_a");
  });

  it("memoizes index computation across multiple calls via getHeuristicIndex", () => {
    const files: Record<string, FileNode> = {
      "file:root": createMockFile("file:root", "src/index.ts"),
    };

    const graph = createGraph(files, {});

    const index1 = getHeuristicIndex(graph);
    const index2 = getHeuristicIndex(graph);

    expect(index1).toBe(index2);
  });
});
