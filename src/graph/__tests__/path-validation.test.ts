import { describe, it, expect } from "vitest";
import type { CodebaseGraph } from "@/entities";
import {
  validateDependencyChain,
  validateOrDiscoverPath,
  findClosestCommonAncestor,
} from "../path-validation";

describe("path-validation", () => {
  const mockGraph = {
    schemaVersion: 1,
    repository: {
      id: "repo:org/app",
      owner: "org",
      name: "app",
      fullName: "org/app",
      defaultBranch: "main",
      commitSha: "sha",
      analyzedAt: "2026-01-01T00:00:00.000Z",
      totalFiles: 4,
      totalSymbols: 0,
      languages: { typescript: 4 },
      schemaVersion: 1,
    },
    directories: {
      "dir:src": { id: "dir:src", path: "src", name: "src" },
      "dir:src/services": {
        id: "dir:src/services",
        path: "src/services",
        name: "services",
      },
    },
    files: {
      "file:src/index.ts": {
        id: "file:src/index.ts",
        path: "src/index.ts",
        name: "index.ts",
        directoryId: "dir:src",
        extension: "ts",
        lineCount: 20,
        characterCount: 300,
        symbolIds: [],
        outgoingImportFileIds: ["file:src/services/api.ts"],
      },
      "file:src/services/api.ts": {
        id: "file:src/services/api.ts",
        path: "src/services/api.ts",
        name: "api.ts",
        directoryId: "dir:src/services",
        extension: "ts",
        lineCount: 40,
        characterCount: 600,
        symbolIds: [],
        outgoingImportFileIds: ["file:src/services/db.ts"],
      },
      "file:src/services/db.ts": {
        id: "file:src/services/db.ts",
        path: "src/services/db.ts",
        name: "db.ts",
        directoryId: "dir:src/services",
        extension: "ts",
        lineCount: 50,
        characterCount: 750,
        symbolIds: [],
        outgoingImportFileIds: [],
      },
      "file:src/isolated.ts": {
        id: "file:src/isolated.ts",
        path: "src/isolated.ts",
        name: "isolated.ts",
        directoryId: "dir:src",
        extension: "ts",
        lineCount: 10,
        characterCount: 150,
        symbolIds: [],
        outgoingImportFileIds: [],
      },
    },
    symbols: {},
    externalModules: {},
    edges: {
      "edge:index->api": {
        id: "edge:index->api",
        sourceId: "file:src/index.ts",
        targetId: "file:src/services/api.ts",
        kind: "file_import",
      },
      "edge:api->db": {
        id: "edge:api->db",
        sourceId: "file:src/services/api.ts",
        targetId: "file:src/services/db.ts",
        kind: "file_import",
      },
    },
  } as unknown as CodebaseGraph;

  describe("validateDependencyChain", () => {
    it("rejects empty candidate node list", () => {
      const result = validateDependencyChain(mockGraph, []);
      expect(result.isValid).toBe(false);
      expect(result.trace).toBeNull();
      expect(result.reason).toContain("no nodes");
    });

    it("accepts a single node as zero-hop valid trace", () => {
      const result = validateDependencyChain(mockGraph, ["file:src/index.ts"]);
      expect(result.isValid).toBe(true);
      expect(result.trace?.hopCount).toBe(0);
      expect(result.trace?.sourceNodeId).toBe("file:src/index.ts");
      expect(result.trace?.targetNodeId).toBe("file:src/index.ts");
    });

    it("rejects non-existent node IDs", () => {
      const result = validateDependencyChain(mockGraph, [
        "file:src/index.ts",
        "file:src/ghost.ts",
      ]);
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain(
        'Node "file:src/ghost.ts" does not exist',
      );
    });

    it("validates a genuine multi-hop chain", () => {
      const result = validateDependencyChain(mockGraph, [
        "file:src/index.ts",
        "file:src/services/api.ts",
        "file:src/services/db.ts",
      ]);
      expect(result.isValid).toBe(true);
      expect(result.trace?.hopCount).toBe(2);
      expect(result.trace?.stepEdgeIds).toEqual([
        "edge:index->api",
        "edge:api->db",
      ]);
    });

    it("detects an invalid hop between non-connected nodes", () => {
      const result = validateDependencyChain(mockGraph, [
        "file:src/index.ts",
        "file:src/services/db.ts",
      ]);
      expect(result.isValid).toBe(false);
      expect(result.failedAtHop).toBe(1);
      expect(result.reason).toContain("No directed edge exists");
    });
  });

  describe("validateOrDiscoverPath", () => {
    it("returns verified candidate path when candidate is valid", () => {
      const result = validateOrDiscoverPath(
        mockGraph,
        "file:src/index.ts",
        "file:src/services/db.ts",
        [
          "file:src/index.ts",
          "file:src/services/api.ts",
          "file:src/services/db.ts",
        ],
      );
      expect(result.isValid).toBe(true);
      expect(result.trace?.hopCount).toBe(2);
    });

    it("discovers path via BFS when candidate is missing or invalid", () => {
      const result = validateOrDiscoverPath(
        mockGraph,
        "file:src/index.ts",
        "file:src/services/db.ts",
      );
      expect(result.isValid).toBe(true);
      expect(result.trace?.hopCount).toBe(2);
      expect(result.trace?.stepNodeIds).toEqual([
        "file:src/index.ts",
        "file:src/services/api.ts",
        "file:src/services/db.ts",
      ]);
    });

    it("returns invalid result when no path connects source and target (covers: AC-7)", () => {
      const result = validateOrDiscoverPath(
        mockGraph,
        "file:src/index.ts",
        "file:src/isolated.ts",
      );
      expect(result.isValid).toBe(false);
      expect(result.trace).toBeNull();
      expect(result.reason).toContain("No dependency path connects");
    });

    it("returns single node trace when source equals target (covers: AC-4)", () => {
      const result = validateOrDiscoverPath(
        mockGraph,
        "file:src/index.ts",
        "file:src/index.ts",
      );
      expect(result.isValid).toBe(true);
      expect(result.trace?.hopCount).toBe(0);
      expect(result.trace?.stepNodeIds).toEqual(["file:src/index.ts"]);
      expect(result.trace?.stepEdgeIds).toEqual([]);
    });

    it("returns invalid when source or target does not exist in graph (covers: AC-4)", () => {
      const resultA = validateOrDiscoverPath(
        mockGraph,
        "file:src/missing.ts",
        "file:src/index.ts",
      );
      expect(resultA.isValid).toBe(false);
      expect(resultA.reason).toContain("No dependency path connects");

      const resultB = validateOrDiscoverPath(
        mockGraph,
        "file:src/index.ts",
        "file:src/missing.ts",
      );
      expect(resultB.isValid).toBe(false);
      expect(resultB.reason).toContain("No dependency path connects");
    });
  });

  describe("findClosestCommonAncestor", () => {
    it("computes common directory for sibling files in same folder (covers: AC-7)", () => {
      const result = findClosestCommonAncestor(
        "file:src/services/api.ts",
        "file:src/services/db.ts",
      );
      expect(result.commonDirectory).toBe("src/services");
      expect(result.distanceA).toBe(0);
      expect(result.distanceB).toBe(0);
    });

    it("computes common parent folder for files in divergent subdirectories (covers: AC-7)", () => {
      const result = findClosestCommonAncestor(
        "src/components/canvas/node.tsx",
        "src/components/editor/viewer.tsx",
      );
      expect(result.commonDirectory).toBe("src/components");
      expect(result.distanceA).toBe(1);
      expect(result.distanceB).toBe(1);
    });

    it("falls back to root when files meet only at top level directory (covers: AC-7)", () => {
      const result = findClosestCommonAncestor(
        "src/index.ts",
        "docs/readme.md",
      );
      expect(result.commonDirectory).toBe("/");
    });

    it("handles identical paths and provides explanatory rationale (covers: AC-7)", () => {
      const result = findClosestCommonAncestor(
        "src/services/api.ts",
        "src/services/api.ts",
      );
      expect(result.commonDirectory).toBe("src/services");
      expect(result.distanceA).toBe(0);
      expect(result.distanceB).toBe(0);
      expect(result.rationale).toContain("src/services");
    });
  });
});
