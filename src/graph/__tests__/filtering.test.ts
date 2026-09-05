import { describe, it, expect } from "vitest";
import {
  resolveOutermostCollapsedFolders,
  computeDominantLayer,
  matchesSearchTokens,
  filterAndAggregateGraph,
} from "../filtering";
import type {
  CodebaseGraph,
  FileNode,
  GraphEdge,
  ExternalModuleNode,
  DirectoryNode,
} from "@/entities";
import type { GraphFilterState } from "@/stores/graph-store";

describe("Graph Filtering and Edge Aggregation", () => {
  describe("resolveOutermostCollapsedFolders", () => {
    it("subsumes descendant folders into outermost ancestor (AC-4)", () => {
      const folders = [
        "src/components/ui",
        "src/components",
        "src",
        "folder-group:src/hooks",
      ];
      const outermost = resolveOutermostCollapsedFolders(folders);
      expect(outermost).toEqual(["src"]);
    });

    it("preserves distinct sibling folders", () => {
      const folders = ["src/components", "src/hooks", "src/stores"];
      const outermost = resolveOutermostCollapsedFolders(folders);
      expect(outermost).toEqual(["src/components", "src/hooks", "src/stores"]);
    });

    it("returns empty array for empty input", () => {
      expect(resolveOutermostCollapsedFolders([])).toEqual([]);
    });
  });

  describe("computeDominantLayer", () => {
    it("selects dominant layer by majority file count (AC-4)", () => {
      const files: FileNode[] = [
        { id: "1", path: "src/components/button.tsx" } as FileNode,
        { id: "2", path: "src/components/card.tsx" } as FileNode,
        { id: "3", path: "src/hooks/use-button.ts" } as FileNode,
      ];
      expect(computeDominantLayer(files)).toBe("components");
    });

    it("resolves ties using lowest rank integer (AC-4)", () => {
      // components has rank 1, hooks has rank 2
      const files: FileNode[] = [
        { id: "1", path: "src/components/button.tsx" } as FileNode,
        { id: "2", path: "src/hooks/use-button.ts" } as FileNode,
      ];
      expect(computeDominantLayer(files)).toBe("components");
    });
  });

  describe("matchesSearchTokens", () => {
    const mockGraph = {
      symbols: {
        "sym:1": { id: "sym:1", name: "useAuthSession" },
      },
    } as unknown as CodebaseGraph;

    const file: FileNode = {
      id: "file:auth",
      name: "auth.ts",
      path: "src/hooks/auth.ts",
      symbolIds: ["sym:1"],
    } as unknown as FileNode;

    it("matches all tokens across path, name, and symbols with AND condition (AC-6)", () => {
      expect(matchesSearchTokens(file, ["auth", "session"], mockGraph)).toBe(
        true,
      );
      expect(matchesSearchTokens(file, ["hooks", "auth"], mockGraph)).toBe(
        true,
      );
      expect(matchesSearchTokens(file, ["auth", "missing"], mockGraph)).toBe(
        false,
      );
    });
  });

  describe("filterAndAggregateGraph", () => {
    const mockGraph: CodebaseGraph = {
      schemaVersion: 1,
      repository: {
        id: "repo:test/repo",
        owner: "test",
        name: "repo",
        fullName: "test/repo",
        defaultBranch: "main",
        commitSha: "abcdef123456",
        analyzedAt: "2026-09-05T00:00:00Z",
        totalFiles: 4,
        totalSymbols: 0,
        languages: { typescript: 100 },
        schemaVersion: 1,
      },
      directories: {
        "dir:src/components": {
          id: "dir:src/components",
          path: "src/components",
          name: "components",
          parentDirId: null,
          childDirIds: [],
          childFileIds: ["file:btn", "file:card"],
        } as DirectoryNode,
        "dir:src/utils": {
          id: "dir:src/utils",
          path: "src/utils",
          name: "utils",
          parentDirId: null,
          childDirIds: [],
          childFileIds: ["file:format"],
        } as DirectoryNode,
      },
      files: {
        "file:btn": {
          id: "file:btn",
          path: "src/components/btn.tsx",
          name: "btn.tsx",
          symbolIds: [],
        } as unknown as FileNode,
        "file:card": {
          id: "file:card",
          path: "src/components/card.tsx",
          name: "card.tsx",
          symbolIds: [],
        } as unknown as FileNode,
        "file:format": {
          id: "file:format",
          path: "src/utils/format.ts",
          name: "format.ts",
          symbolIds: [],
        } as unknown as FileNode,
      },
      symbols: {},
      externalModules: {
        "ext:react": {
          id: "ext:react",
          name: "react",
          isStdLib: false,
          symbolIds: [],
        } as unknown as ExternalModuleNode,
      },
      edges: {
        "edge:1": {
          id: "edge:1",
          sourceId: "file:card",
          targetId: "file:btn",
          kind: "file_import",
          weight: 1,
          isExternal: false,
        } as GraphEdge,
        "edge:2": {
          id: "edge:2",
          sourceId: "file:card",
          targetId: "file:format",
          kind: "file_import",
          weight: 2,
          isExternal: false,
        } as GraphEdge,
        "edge:3": {
          id: "edge:3",
          sourceId: "file:btn",
          targetId: "ext:react",
          kind: "file_import",
          weight: 1,
          isExternal: true,
        } as GraphEdge,
      },
    };

    it("filters graph by architectural layer (AC-1, AC-3)", () => {
      const filters: GraphFilterState = {
        selectedLayers: ["components"],
        collapsedFolderIds: [],
        searchQuery: "",
        hideExternal: false,
      };

      const result = filterAndAggregateGraph(mockGraph, filters);
      expect(result.visibleFiles.map((f) => f.id)).toEqual([
        "file:btn",
        "file:card",
      ]);
      expect(result.visibleEdges.map((e) => e.id)).toEqual([
        "edge:1",
        "edge:3",
      ]);
      // edge:2 is pruned because format.ts is in utils and not visible
      expect(
        result.visibleEdges.find((e) => e.id === "edge:2"),
      ).toBeUndefined();
    });

    it("collapses folder into aggregate folder summary and bundles edges (AC-4)", () => {
      const filters: GraphFilterState = {
        selectedLayers: [],
        collapsedFolderIds: ["src/components"],
        searchQuery: "",
        hideExternal: false,
      };

      const result = filterAndAggregateGraph(mockGraph, filters);
      expect(result.collapsedFolders.length).toBe(1);
      const folder = result.collapsedFolders[0];
      expect(folder.path).toBe("src/components");
      expect(folder.fileCount).toBe(2);
      expect(folder.dominantLayerId).toBe("components");
      expect(folder.externalExportCount).toBe(3); // edge:2 (weight 2) + edge:3 (weight 1)
      expect(folder.externalImportCount).toBe(0);

      // edge:1 (card -> btn) is internal to collapsed folder and vanished
      expect(
        result.visibleEdges.find((e) => e.id === "edge:1"),
      ).toBeUndefined();

      // edge:2 and edge:3 are bundled with folder as source
      expect(result.bundledEdges.length).toBe(2);
      const toFormat = result.bundledEdges.find(
        (e) => e.targetId === "file:format",
      );
      expect(toFormat?.sourceId).toBe("folder-group:src/components");
      expect(toFormat?.weight).toBe(2);
    });

    it("hides external modules when hideExternal is true", () => {
      const filters: GraphFilterState = {
        selectedLayers: [],
        collapsedFolderIds: [],
        searchQuery: "",
        hideExternal: true,
      };

      const result = filterAndAggregateGraph(mockGraph, filters);
      expect(result.visibleExternalModules).toEqual([]);
      // edge:3 connected to ext:react is pruned
      expect(
        result.visibleEdges.find((e) => e.id === "edge:3"),
      ).toBeUndefined();
    });

    it("returns empty result structure when graph is null or has zero files (AC-3)", () => {
      const filters: GraphFilterState = {
        selectedLayers: [],
        collapsedFolderIds: [],
        searchQuery: "",
        hideExternal: false,
      };

      const nullResult = filterAndAggregateGraph(null, filters);
      expect(nullResult.visibleFiles).toEqual([]);
      expect(nullResult.visibleEdges).toEqual([]);
      expect(nullResult.collapsedFolders).toEqual([]);

      const emptyResult = filterAndAggregateGraph(
        { files: {} } as unknown as CodebaseGraph,
        filters,
      );
      expect(emptyResult.visibleFiles).toEqual([]);
      expect(emptyResult.visibleEdges).toEqual([]);
    });

    it("bundles edges between two different collapsed folders (AC-4)", () => {
      const filters: GraphFilterState = {
        selectedLayers: [],
        collapsedFolderIds: ["src/components", "src/utils"],
        searchQuery: "",
        hideExternal: false,
      };

      const result = filterAndAggregateGraph(mockGraph, filters);
      expect(result.collapsedFolders.length).toBe(2);
      expect(result.visibleFiles.length).toBe(0);

      // edge:2 (card in components -> format in utils) connects two collapsed folders
      const crossFolderEdge = result.bundledEdges.find(
        (e) =>
          e.sourceId === "folder-group:src/components" &&
          e.targetId === "folder-group:src/utils",
      );
      expect(crossFolderEdge).toBeDefined();
      expect(crossFolderEdge?.weight).toBe(2);
    });

    it("returns zero visible nodes when search query matches nothing (AC-6, AC-10)", () => {
      const filters: GraphFilterState = {
        selectedLayers: [],
        collapsedFolderIds: [],
        searchQuery: "nonexistent_term_xyz",
        hideExternal: false,
      };

      const result = filterAndAggregateGraph(mockGraph, filters);
      expect(result.visibleFiles).toEqual([]);
      expect(result.visibleEdges).toEqual([]);
      expect(result.bundledEdges).toEqual([]);
      expect(result.visibleDirectories).toEqual([]);
    });

    it("prunes directories containing no visible files (AC-3)", () => {
      const filters: GraphFilterState = {
        selectedLayers: ["components"], // excludes utils
        collapsedFolderIds: [],
        searchQuery: "",
        hideExternal: false,
      };

      const result = filterAndAggregateGraph(mockGraph, filters);
      expect(result.visibleDirectories.map((d) => d.id)).toEqual([
        "dir:src/components",
      ]);
      expect(
        result.visibleDirectories.find((d) => d.id === "dir:src/utils"),
      ).toBeUndefined();
    });
  });
});
