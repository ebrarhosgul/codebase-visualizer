import { describe, it, expect } from "vitest";
import {
  CURRENT_SCHEMA_VERSION,
  createGraphEdge,
  type CodebaseGraph,
  type FileNode,
  type GraphEdge,
  type SymbolNode,
} from "@/entities";
import { buildHeuristicIndex } from "@/graph/heuristic-index";
import { buildCentralFilesAnswer } from "../builders/central-files";
import { buildLayerBreakdownAnswer } from "../builders/layer-breakdown";
import { buildStateFlowAnswer } from "../builders/state-flow";
import { buildOverviewAnswer } from "../builders/overview";
import { buildPathTraceAnswer } from "../builders/path-trace";
import type { AIRequestContext } from "../../types";

const mockRepo = {
  id: "repo:test-owner/test-repo",
  owner: "test-owner",
  name: "test-repo",
  fullName: "test-owner/test-repo",
  defaultBranch: "main",
  commitSha: "123456",
  analyzedAt: "2026-09-02T19:00:00.000Z",
  totalFiles: 5,
  totalSymbols: 5,
  languages: { TypeScript: 100 },
  schemaVersion: CURRENT_SCHEMA_VERSION,
};

function createMockFile(
  id: string,
  path: string,
  exportIds: string[] = [],
): FileNode {
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
    exportIds,
  };
}

function createMockEdge(
  sourceId: string,
  targetId: string,
  kind: "file_import" | "re_export" = "file_import",
): GraphEdge {
  return createGraphEdge({
    sourceId,
    targetId,
    kind,
    isExternal: false,
  });
}

function createGraph(
  files: Record<string, FileNode>,
  edges: Record<string, GraphEdge> = {},
  symbols: Record<string, SymbolNode> = {},
): CodebaseGraph {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    repository: mockRepo,
    files,
    edges,
    directories: {},
    symbols,
    externalModules: {},
  };
}

describe("Demo Heuristic Builders", () => {
  describe("buildCentralFilesAnswer", () => {
    it("identifies and ranks files by fanIn descending", () => {
      const files = {
        "file:api": createMockFile("file:api", "src/api/client.ts"),
        "file:utils": createMockFile("file:utils", "src/utils/helpers.ts"),
        "file:compA": createMockFile("file:compA", "src/components/CompA.tsx"),
        "file:compB": createMockFile("file:compB", "src/components/CompB.tsx"),
        "file:compC": createMockFile("file:compC", "src/components/CompC.tsx"),
      };

      const edges = {
        e1: createMockEdge("file:compA", "file:api"),
        e2: createMockEdge("file:compB", "file:api"),
        e3: createMockEdge("file:compC", "file:api"),
        e4: createMockEdge("file:compA", "file:utils"),
      };

      const graph = createGraph(files, edges);
      const index = buildHeuristicIndex(graph);
      const answer = buildCentralFilesAnswer(graph, index);

      expect(answer.intent).toBe("central_files");
      expect(answer.citations.length).toBeGreaterThan(0);
      expect(answer.citations[0].fileId).toBe("file:api");
      expect(answer.highlightNodeIds).toContain("file:api");
      expect(answer.markdown).toContain(
        "Core Central Files for `test-owner/test-repo`",
      );
      expect(answer.markdown).toContain("src/api/client.ts");
    });

    it("returns honest fallback when graph has no internal import edges", () => {
      const files = {
        "file:one": createMockFile("file:one", "src/one.ts"),
        "file:two": createMockFile("file:two", "src/two.ts"),
      };
      const graph = createGraph(files, {});
      const index = buildHeuristicIndex(graph);
      const answer = buildCentralFilesAnswer(graph, index);

      expect(answer.isFallback).toBe(true);
      expect(answer.markdown).toContain("no internal import edges detected");
      expect(answer.citations.length).toBe(0);
      expect(answer.highlightNodeIds.length).toBe(0);
    });
  });

  describe("buildLayerBreakdownAnswer", () => {
    it("reports architecture layer distribution and notes inverted edges", () => {
      const files = {
        "file:comp": createMockFile("file:comp", "src/components/Button.tsx"),
        "file:hook": createMockFile("file:hook", "src/hooks/useButton.ts"),
        "file:util": createMockFile("file:util", "src/utils/format.ts"),
      };

      const edges = {
        e1: createMockEdge("file:comp", "file:hook"),
        // inverted: utils -> components
        e2: createMockEdge("file:util", "file:comp"),
      };

      const graph = createGraph(files, edges);
      const index = buildHeuristicIndex(graph);
      const answer = buildLayerBreakdownAnswer(graph, index);

      expect(answer.intent).toBe("layer_breakdown");
      expect(answer.markdown).toContain("Architecture & Layer Breakdown");
      expect(answer.markdown).toContain("Components");
      expect(answer.markdown).toContain("Inverted Layer Dependencies:");
      expect(answer.citations.length).toBeGreaterThan(0);
    });

    it("handles zero files gracefully", () => {
      const graph = createGraph({}, {});
      const index = buildHeuristicIndex(graph);
      const answer = buildLayerBreakdownAnswer(graph, index);

      expect(answer.isFallback).toBe(true);
      expect(answer.markdown).toContain("0 files parsed");
    });
  });

  describe("buildStateFlowAnswer", () => {
    it("traces consumption hierarchy when stores exist", () => {
      const files = {
        "file:store": createMockFile("file:store", "src/stores/auth-store.ts"),
        "file:hook": createMockFile("file:hook", "src/hooks/useAuth.ts"),
        "file:comp": createMockFile("file:comp", "src/components/Login.tsx"),
      };

      const edges = {
        e1: createMockEdge("file:hook", "file:store"),
        e2: createMockEdge("file:comp", "file:hook"),
      };

      const graph = createGraph(files, edges);
      const index = buildHeuristicIndex(graph);
      const answer = buildStateFlowAnswer(graph, index);

      expect(answer.intent).toBe("state_flow");
      expect(answer.markdown).toContain("State Management Flow");
      expect(answer.markdown).toContain("src/stores/auth-store.ts");
      expect(answer.citations.some((c) => c.fileId === "file:store")).toBe(
        true,
      );
    });

    it("falls back to state symbols when no stores layer exists", () => {
      const symbols: Record<string, SymbolNode> = {
        "sym:auth_state": {
          id: "symbol:file:hook:useAuthState",
          fileId: "file:hook",
          parentSymbolId: null,
          name: "useAuthState",
          kind: "function",
          range: {
            startLine: 1,
            startColumn: 1,
            endLine: 10,
            endColumn: 1,
            startOffset: 0,
            endOffset: 50,
          },
          selectionRange: {
            startLine: 1,
            startColumn: 1,
            endLine: 10,
            endColumn: 1,
            startOffset: 0,
            endOffset: 50,
          },
          isExported: true,
          isDefaultExport: false,
          signature: "function useAuthState()",
          documentation: null,
          visibility: "public",
          childSymbolIds: [],
        },
      };

      const files = {
        "file:hook": createMockFile("file:hook", "src/hooks/useAuth.ts", [
          "sym:auth_state",
        ]),
        "file:comp": createMockFile("file:comp", "src/components/View.tsx"),
      };

      const edges = {
        e1: createMockEdge("file:comp", "file:hook"),
      };

      const graph = createGraph(files, edges, symbols);
      const index = buildHeuristicIndex(graph);
      const answer = buildStateFlowAnswer(graph, index);

      expect(answer.intent).toBe("state_flow");
      expect(answer.markdown).toContain("State Management Flow");
      expect(answer.markdown).toContain("src/hooks/useAuth.ts");
      expect(answer.citations.some((c) => c.fileId === "file:hook")).toBe(true);
    });

    it("reports no state pattern when neither stores nor state symbols are present", () => {
      const files = {
        "file:util": createMockFile("file:util", "src/utils/math.ts"),
        "file:comp": createMockFile("file:comp", "src/components/View.tsx"),
      };
      const edges = {
        e1: createMockEdge("file:comp", "file:util"),
      };
      const graph = createGraph(files, edges);
      const index = buildHeuristicIndex(graph);
      const answer = buildStateFlowAnswer(graph, index);

      expect(answer.intent).toBe("state_flow");
      expect(answer.markdown).toContain(
        "No state management pattern was detected",
      );
    });
  });

  describe("buildOverviewAnswer", () => {
    it("summarizes codebase layers and capabilities", () => {
      const files = {
        "file:a": createMockFile("file:a", "src/components/App.tsx"),
        "file:b": createMockFile("file:b", "src/utils/math.ts"),
      };

      const graph = createGraph(files, {});
      const index = buildHeuristicIndex(graph);
      const answer = buildOverviewAnswer(graph, index);

      expect(answer.intent).toBe("overview");
      expect(answer.markdown).toContain(
        "Architecture Overview for `test-owner/test-repo`",
      );
      expect(answer.markdown).toContain("What Demo Mode Can Answer");
      expect(answer.markdown).toContain("**Total files**: 2");
    });
  });

  describe("buildPathTraceAnswer", () => {
    it("returns PathTrace when direct or transitive connection exists between mentioned files", () => {
      const files = {
        "file:source": createMockFile("file:source", "src/components/App.tsx"),
        "file:mid": createMockFile("file:mid", "src/services/api.ts"),
        "file:target": createMockFile("file:target", "src/utils/http.ts"),
      };

      const edges = {
        e1: createMockEdge("file:source", "file:mid"),
        e2: createMockEdge("file:mid", "file:target"),
      };

      const graph = createGraph(files, edges);
      const context: AIRequestContext = {
        repository: graph.repository,
        graph,
        contextSummary: "Summary",
      };

      const answer = buildPathTraceAnswer(
        context,
        "Trace path from App.tsx to http.ts",
      );

      expect(answer.intent).toBe("path_trace");
      expect(answer.trace).not.toBeNull();
      expect(answer.trace?.sourceNodeId).toBe("file:source");
      expect(answer.trace?.targetNodeId).toBe("file:target");
      expect(answer.trace?.hopCount).toBe(2);
      expect(answer.markdown).toContain("Dependency Path:");
      expect(answer.markdown).toContain("direct dependency chain");
    });

    it("explains architectural separation when no connection exists", () => {
      const files = {
        "file:a": createMockFile("file:a", "src/features/auth/login.tsx"),
        "file:b": createMockFile("file:b", "src/features/billing/invoice.tsx"),
      };

      const graph = createGraph(files, {});
      const context: AIRequestContext = {
        repository: graph.repository,
        graph,
        contextSummary: "Summary",
      };

      const answer = buildPathTraceAnswer(
        context,
        "Connect login.tsx and invoice.tsx",
      );

      expect(answer.intent).toBe("path_trace");
      expect(answer.trace).toBeNull();
      expect(answer.markdown).toContain("Architectural Separation Notice");
      expect(answer.markdown).toContain("Closest Common Directory:");
    });
  });
});
