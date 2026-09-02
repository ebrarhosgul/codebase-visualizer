import { describe, it, expect } from "vitest";
import {
  createRepositoryId,
  CURRENT_SCHEMA_VERSION,
  createDirectoryId,
  createFileId,
  createSymbolId,
  createExternalModuleId,
  createGraphEdge,
  type CodebaseGraph,
} from "../../entities";
import {
  traverseGraph,
  filterGraphByScope,
  buildAdjacencyIndex,
} from "../traversal";
import { findDependencyPath } from "../path-trace";
import { toReactFlowElements } from "../adapters/react-flow-adapter";

describe("Graph Operations and React Flow Adapter (AC-6, AC-8)", () => {
  const sampleRepo = {
    id: createRepositoryId("org", "app"),
    owner: "org",
    name: "app",
    fullName: "org/app",
    defaultBranch: "main",
    commitSha: "fedcba654321",
    analyzedAt: "2026-09-02T19:00:00.000Z",
    totalFiles: 3,
    totalSymbols: 3,
    languages: { TypeScript: 100 },
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };

  /**
   * Helper constructing a graph with a circular dependency between module A and module B:
   * A -> B -> C -> A (cycle!)
   */
  function createCyclicGraph(): CodebaseGraph {
    const dirId = createDirectoryId("src");
    const fileA = createFileId("src/a.ts");
    const fileB = createFileId("src/b.ts");
    const fileC = createFileId("src/c.ts");
    const extReact = createExternalModuleId("react");

    const edgeAB = createGraphEdge({
      sourceId: fileA,
      targetId: fileB,
      kind: "file_import",
    });
    const edgeBC = createGraphEdge({
      sourceId: fileB,
      targetId: fileC,
      kind: "file_import",
    });
    const edgeCA = createGraphEdge({
      sourceId: fileC,
      targetId: fileA,
      kind: "file_import", // cycle!
    });
    const edgeAExt = createGraphEdge({
      sourceId: fileA,
      targetId: extReact,
      kind: "file_import",
    });

    const symA = createSymbolId("src/a.ts", "funcA");
    const symB = createSymbolId("src/b.ts", "funcB");

    const edgeSymCall = createGraphEdge({
      sourceId: symA,
      targetId: symB,
      kind: "call",
      weight: 3,
    });

    return {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      repository: sampleRepo,
      directories: {
        [dirId]: {
          id: dirId,
          path: "src",
          name: "src",
          parentDirId: null,
          childDirIds: [],
          childFileIds: [fileA, fileB, fileC],
        },
      },
      files: {
        [fileA]: {
          id: fileA,
          path: "src/a.ts",
          name: "a.ts",
          extension: ".ts",
          language: "typescript",
          sizeBytes: 100,
          lineCount: 10,
          directoryId: dirId,
          symbolIds: [symA],
          importIds: [fileB, extReact],
          exportIds: [symA],
        },
        [fileB]: {
          id: fileB,
          path: "src/b.ts",
          name: "b.ts",
          extension: ".ts",
          language: "typescript",
          sizeBytes: 100,
          lineCount: 10,
          directoryId: dirId,
          symbolIds: [symB],
          importIds: [fileC],
          exportIds: [symB],
        },
        [fileC]: {
          id: fileC,
          path: "src/c.ts",
          name: "c.ts",
          extension: ".ts",
          language: "typescript",
          sizeBytes: 100,
          lineCount: 10,
          directoryId: dirId,
          symbolIds: [],
          importIds: [fileA],
          exportIds: [],
        },
      },
      symbols: {
        [symA]: {
          id: symA,
          fileId: fileA,
          parentSymbolId: null,
          name: "funcA",
          kind: "function",
          range: {
            startLine: 1,
            startColumn: 1,
            endLine: 5,
            endColumn: 2,
            startOffset: 0,
            endOffset: 50,
          },
          selectionRange: {
            startLine: 1,
            startColumn: 10,
            endLine: 1,
            endColumn: 15,
            startOffset: 9,
            endOffset: 14,
          },
          isExported: true,
          isDefaultExport: false,
          signature: "export function funcA(): void",
          documentation: null,
          visibility: "public",
          childSymbolIds: [],
        },
        [symB]: {
          id: symB,
          fileId: fileB,
          parentSymbolId: null,
          name: "funcB",
          kind: "function",
          range: {
            startLine: 1,
            startColumn: 1,
            endLine: 5,
            endColumn: 2,
            startOffset: 0,
            endOffset: 50,
          },
          selectionRange: {
            startLine: 1,
            startColumn: 10,
            endLine: 1,
            endColumn: 15,
            startOffset: 9,
            endOffset: 14,
          },
          isExported: true,
          isDefaultExport: false,
          signature: "export function funcB(): void",
          documentation: null,
          visibility: "public",
          childSymbolIds: [],
        },
      },
      externalModules: {
        [extReact]: {
          id: extReact,
          name: "react",
          isExternal: true,
        },
      },
      edges: {
        [edgeAB.id]: edgeAB,
        [edgeBC.id]: edgeBC,
        [edgeCA.id]: edgeCA,
        [edgeAExt.id]: edgeAExt,
        [edgeSymCall.id]: edgeSymCall,
      },
    };
  }

  describe("Cycle-Safe Traversal (AC-6)", () => {
    it("builds bidirectional adjacency index", () => {
      const graph = createCyclicGraph();
      const index = buildAdjacencyIndex(graph.edges);

      const fileA = createFileId("src/a.ts");
      const outgoing = index.outgoing[fileA] ?? [];
      expect(outgoing.length).toBe(2); // imports b.ts and react

      const incoming = index.incoming[fileA] ?? [];
      expect(incoming.length).toBe(1); // c.ts imports a.ts
    });

    it("traverses circular directed graph without infinite loops or stack overflow", () => {
      const graph = createCyclicGraph();
      const fileA = createFileId("src/a.ts");

      const visited = traverseGraph(graph, {
        startNodeId: fileA,
        direction: "outgoing",
      });

      // Visited all reachable nodes in cycle and stopped safely
      expect(visited).toContain("file:src/a.ts");
      expect(visited).toContain("file:src/b.ts");
      expect(visited).toContain("file:src/c.ts");
      expect(visited).toContain("ext:react");
      // No duplicates
      expect(new Set(visited).size).toBe(visited.length);
    });

    it("finds dependency path through circular edges safely", () => {
      const graph = createCyclicGraph();
      const fileA = createFileId("src/a.ts");
      const fileC = createFileId("src/c.ts");

      // A -> B -> C
      const trace = findDependencyPath(graph, fileA, fileC);
      expect(trace).not.toBeNull();
      if (trace) {
        expect(trace.hopCount).toBe(2);
        expect(trace.stepNodeIds).toEqual([
          "file:src/a.ts",
          "file:src/b.ts",
          "file:src/c.ts",
        ]);
        expect(trace.stepEdgeIds).toEqual([
          "edge:file:src/a.ts->file:src/b.ts:file_import",
          "edge:file:src/b.ts->file:src/c.ts:file_import",
        ]);
      }
    });

    it("resolves cycle backwards C -> A in 1 hop", () => {
      const graph = createCyclicGraph();
      const fileC = createFileId("src/c.ts");
      const fileA = createFileId("src/a.ts");

      const trace = findDependencyPath(graph, fileC, fileA);
      expect(trace).not.toBeNull();
      if (trace) {
        expect(trace.hopCount).toBe(1);
        expect(trace.stepNodeIds).toEqual(["file:src/c.ts", "file:src/a.ts"]);
      }
    });

    it("returns null when no path exists between disconnected nodes", () => {
      const graph = createCyclicGraph();
      const extReact = createExternalModuleId("react");
      const fileA = createFileId("src/a.ts");

      // react has no outgoing edges back to fileA
      const trace = findDependencyPath(graph, extReact, fileA);
      expect(trace).toBeNull();
    });

    it("returns null when queried with non-existent node IDs", () => {
      const graph = createCyclicGraph();
      const trace = findDependencyPath(graph, "non-existent", "file:src/a.ts");
      expect(trace).toBeNull();
    });
  });

  describe("Scope Filtering (AC-6, AC-8)", () => {
    it("filters graph to directory scope only", () => {
      const graph = createCyclicGraph();
      const filtered = filterGraphByScope(graph, {
        granularity: "directories",
        includeExternal: false,
      });

      expect(Object.keys(filtered.directories)).toHaveLength(1);
      expect(Object.keys(filtered.files)).toHaveLength(0);
      expect(Object.keys(filtered.symbols)).toHaveLength(0);
      expect(Object.keys(filtered.externalModules)).toHaveLength(0);
    });

    it("filters graph to exclude external packages", () => {
      const graph = createCyclicGraph();
      const filtered = filterGraphByScope(graph, {
        granularity: "all",
        includeExternal: false,
      });

      expect(Object.keys(filtered.externalModules)).toHaveLength(0);
      expect(
        filtered.edges["edge:file:src/a.ts->ext:react:file_import"],
      ).toBeUndefined();
    });
  });

  describe("React Flow Projection Adapter (AC-8)", () => {
    it("projects CodebaseGraph into React Flow elements without mutating domain graph", () => {
      const graph = createCyclicGraph();
      const elements = toReactFlowElements(graph, {
        scope: {
          granularity: "all",
          includeExternal: true,
        },
      });

      // Check node elements
      expect(elements.nodes.length).toBeGreaterThan(0);
      const fileANode = elements.nodes.find((n) => n.id === "file:src/a.ts");
      expect(fileANode).toBeDefined();
      expect(fileANode?.type).toBe("file");
      expect(fileANode?.data.label).toBe("a.ts");
      expect(fileANode?.position).toEqual({ x: 0, y: 0 });

      // Check edge elements
      const edgeElem = elements.edges.find(
        (e) => e.id === "edge:file:src/a.ts->file:src/b.ts:file_import",
      );
      expect(edgeElem).toBeDefined();
      expect(edgeElem?.source).toBe("file:src/a.ts");
      expect(edgeElem?.target).toBe("file:src/b.ts");
      expect(edgeElem?.type).toBe("file_import");

      // Check repeated edge weight label
      const symCallEdge = elements.edges.find(
        (e) =>
          e.id === "edge:symbol:src/a.ts#funcA->symbol:src/b.ts#funcB:call",
      );
      expect(symCallEdge?.label).toBe("x3");
    });

    it("filters projected elements by searchQuery", () => {
      const graph = createCyclicGraph();
      const elements = toReactFlowElements(graph, {
        scope: {
          granularity: "all",
          includeExternal: false,
        },
        searchQuery: "a.ts",
      });

      expect(elements.nodes.map((n) => n.id)).toContain("file:src/a.ts");
      expect(
        elements.nodes.find((n) => n.id === "file:src/b.ts"),
      ).toBeUndefined();
    });

    it("filters projected elements by enabledEdgeKinds", () => {
      const graph = createCyclicGraph();
      const elements = toReactFlowElements(graph, {
        scope: {
          granularity: "all",
          includeExternal: true,
        },
        enabledEdgeKinds: ["call"],
      });

      // Only 'call' edges should be projected
      expect(elements.edges.every((e) => e.type === "call")).toBe(true);
      expect(elements.edges.length).toBe(1);
    });
  });
});
