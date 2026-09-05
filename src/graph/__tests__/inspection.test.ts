import { describe, it, expect } from "vitest";
import { getNodeInspectionDetail } from "../inspection";
import type {
  CodebaseGraph,
  FileNode,
  SymbolNode,
  GraphEdge,
  DirectoryNode,
} from "@/entities";

describe("Structural Node Inspection Calculator", () => {
  const mockGraph: CodebaseGraph = {
    schemaVersion: 1,
    repository: {
      id: "repo:test/repo",
      owner: "test",
      name: "repo",
      fullName: "test/repo",
      defaultBranch: "main",
      commitSha: "abc",
      analyzedAt: "2026-09-05T00:00:00Z",
      totalFiles: 3,
      totalSymbols: 2,
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
        childFileIds: ["file:src/components/button.tsx"],
      } as DirectoryNode,
    },
    files: {
      "file:src/components/button.tsx": {
        id: "file:src/components/button.tsx",
        path: "src/components/button.tsx",
        name: "button.tsx",
        lineCount: 45,
        sizeBytes: 1200,
        symbolIds: ["symbol:button", "symbol:internalHelper"],
      } as unknown as FileNode,
      "file:src/app/page.tsx": {
        id: "file:src/app/page.tsx",
        path: "src/app/page.tsx",
        name: "page.tsx",
        lineCount: 80,
        sizeBytes: 2500,
        symbolIds: [],
      } as unknown as FileNode,
    },
    symbols: {
      "symbol:button": {
        id: "symbol:button",
        name: "Button",
        kind: "function",
        fileId: "file:src/components/button.tsx",
        range: { startLine: 10, endLine: 35, startColumn: 1, endColumn: 2 },
        isExported: true,
      } as unknown as SymbolNode,
      "symbol:internalHelper": {
        id: "symbol:internalHelper",
        name: "formatClass",
        kind: "function",
        fileId: "file:src/components/button.tsx",
        range: { startLine: 38, endLine: 44, startColumn: 1, endColumn: 2 },
        isExported: false,
      } as unknown as SymbolNode,
    },
    externalModules: {},
    edges: {
      "edge:1": {
        id: "edge:1",
        sourceId: "file:src/app/page.tsx",
        targetId: "file:src/components/button.tsx",
        kind: "file_import",
        weight: 1,
        isExternal: false,
      } as GraphEdge,
    },
  };

  it("calculates file node inspection details (AC-7)", () => {
    const detail = getNodeInspectionDetail(
      mockGraph,
      "file:src/components/button.tsx",
      true,
    );
    expect(detail).toBeDefined();
    expect(detail?.entityType).toBe("file");
    expect(detail?.displayName).toBe("button.tsx");
    expect(detail?.layerId).toBe("components");
    expect(detail?.metrics.fanIn).toBe(1);
    expect(detail?.metrics.fanOut).toBe(0);
    expect(detail?.metrics.lineCount).toBe(45);
    expect(detail?.metrics.symbolCount).toBe(2);

    expect(detail?.exportedSymbols.length).toBe(1);
    expect(detail?.exportedSymbols[0]?.name).toBe("Button");

    expect(detail?.internalSymbols.length).toBe(1);
    expect(detail?.internalSymbols[0]?.name).toBe("formatClass");

    expect(detail?.incomingDependencies[0]?.sourceFileName).toBe("page.tsx");
  });

  it("calculates symbol node inspection details (AC-7)", () => {
    const detail = getNodeInspectionDetail(mockGraph, "symbol:button", true);
    expect(detail).toBeDefined();
    expect(detail?.entityType).toBe("symbol");
    expect(detail?.displayName).toBe("Button");
    expect(detail?.filePath).toBe("src/components/button.tsx");
  });

  it("calculates directory inspection details (AC-7)", () => {
    const detail = getNodeInspectionDetail(
      mockGraph,
      "folder-group:src/components",
      true,
    );
    expect(detail).toBeDefined();
    expect(detail?.entityType).toBe("directory");
    expect(detail?.directoryDetails).toBeDefined();
    expect(detail?.directoryDetails?.totalFiles).toBe(1);
    expect(detail?.directoryDetails?.totalSymbols).toBe(2);
    expect(detail?.directoryDetails?.dominantLayerId).toBe("components");
    expect(detail?.directoryDetails?.externalIncomingCount).toBe(1);
  });

  it("preserves isVisibleOnCanvas flag correctly for hidden nodes (AC-9)", () => {
    const detail = getNodeInspectionDetail(
      mockGraph,
      "file:src/components/button.tsx",
      false,
    );
    expect(detail).toBeDefined();
    expect(detail?.isVisibleOnCanvas).toBe(false);
  });

  it("calculates outgoing dependencies and extracts callLine from edge metadata (AC-7, AC-8)", () => {
    const graphWithCallSite: CodebaseGraph = {
      ...mockGraph,
      edges: {
        "edge:call": {
          id: "edge:call",
          sourceId: "symbol:button",
          targetId: "symbol:internalHelper",
          kind: "call",
          weight: 1,
          isExternal: false,
          metadata: {
            callSites: [
              {
                startLine: 24,
                startColumn: 5,
                endLine: 24,
                endColumn: 20,
                startOffset: 100,
                endOffset: 120,
              },
            ],
          },
        } as unknown as GraphEdge,
      },
    };

    const detail = getNodeInspectionDetail(
      graphWithCallSite,
      "symbol:button",
      true,
    );
    expect(detail).toBeDefined();
    expect(detail?.metrics.fanOut).toBe(1);
    expect(detail?.outgoingDependencies[0]?.dependencyKind).toBe("call");
    expect(detail?.outgoingDependencies[0]?.callLine).toBe(24);
  });

  it("returns null for non existent node or empty directory", () => {
    expect(getNodeInspectionDetail(mockGraph, "file:nonexistent")).toBeNull();
    expect(getNodeInspectionDetail(null, "file:1")).toBeNull();
    expect(
      getNodeInspectionDetail(mockGraph, "folder-group:empty/dir"),
    ).toBeNull();
  });
});
