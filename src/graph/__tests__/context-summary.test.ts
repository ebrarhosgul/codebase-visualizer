import { describe, it, expect } from "vitest";
import type { CodebaseGraph, FileNode } from "@/entities";
import { buildTopologyContextSummary } from "../context-summary";

describe("context-summary", () => {
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
      totalFiles: 3,
      totalSymbols: 2,
      languages: { typescript: 3 },
      schemaVersion: 1,
    },
    directories: {},
    files: {
      "file:src/index.ts": {
        id: "file:src/index.ts",
        path: "src/index.ts",
        name: "index.ts",
        directoryId: "dir:src",
        extension: "ts",
        lineCount: 15,
        characterCount: 200,
        symbolIds: ["sym:main"],
        outgoingImportFileIds: ["file:src/services/api.ts"],
      },
      "file:src/services/api.ts": {
        id: "file:src/services/api.ts",
        path: "src/services/api.ts",
        name: "api.ts",
        directoryId: "dir:src/services",
        extension: "ts",
        lineCount: 30,
        characterCount: 450,
        symbolIds: ["sym:fetchData"],
        outgoingImportFileIds: [],
      },
      "file:src/utils/math.ts": {
        id: "file:src/utils/math.ts",
        path: "src/utils/math.ts",
        name: "math.ts",
        directoryId: "dir:src/utils",
        extension: "ts",
        lineCount: 10,
        characterCount: 100,
        symbolIds: [],
        outgoingImportFileIds: [],
      },
    },
    symbols: {
      "sym:main": {
        id: "sym:main",
        name: "main",
        kind: "function",
        fileId: "file:src/index.ts",
        location: {
          fileId: "file:src/index.ts",
          startLine: 1,
          startColumn: 1,
          endLine: 5,
          endColumn: 2,
        },
        isExported: true,
      },
      "sym:fetchData": {
        id: "sym:fetchData",
        name: "fetchData",
        kind: "function",
        fileId: "file:src/services/api.ts",
        location: {
          fileId: "file:src/services/api.ts",
          startLine: 1,
          startColumn: 1,
          endLine: 10,
          endColumn: 2,
        },
        isExported: true,
      },
    },
    externalModules: {},
    edges: {
      "edge:index->api": {
        id: "edge:index->api",
        sourceId: "file:src/index.ts",
        targetId: "file:src/services/api.ts",
        kind: "file_import",
      },
    },
  } as unknown as CodebaseGraph;

  it("prioritizes entrypoints and prompt matched files (covers: AC-1)", () => {
    const summary = buildTopologyContextSummary(
      mockGraph,
      "how does api service work?",
    );
    expect(summary).toContain("Repository: org/app");
    expect(summary).toContain("src/index.ts");
    expect(summary).toContain("src/services/api.ts");
    expect(summary).toContain("Exports: [fetchData]");
  });

  it("prioritizes high fan in hub files even when not in prompt (covers: AC-4)", () => {
    const summary = buildTopologyContextSummary(
      mockGraph,
      "completely unrelated question",
    );
    // src/services/api.ts has incoming edge from index.ts, so fan in is 1
    expect(summary).toContain("src/services/api.ts");
  });

  it("handles empty files gracefully (covers: AC-1)", () => {
    const emptyGraph: CodebaseGraph = {
      ...mockGraph,
      files: {},
      edges: {},
    };
    const summary = buildTopologyContextSummary(emptyGraph, "query");
    expect(summary).toContain("no parsed files");
  });

  it("respects token budget truncation and includes truncation notice (covers: AC-1)", () => {
    // Generate graph with many files to trigger character limit truncation
    const manyFiles: Record<string, FileNode> = {};
    for (let i = 0; i < 40; i++) {
      const id = `file:src/generated/module${i}.ts`;
      manyFiles[id] = {
        id,
        path: `src/generated/module${i}.ts`,
        name: `module${i}.ts`,
        directoryId: "dir:src/generated",
        extension: "ts",
        language: "typescript",
        sizeBytes: 300,
        lineCount: 20,
        symbolIds: [],
        importIds: [],
        exportIds: [],
      };
    }

    const largeGraph: CodebaseGraph = {
      ...mockGraph,
      files: manyFiles,
      edges: {},
    };

    const summary = buildTopologyContextSummary(largeGraph, "query", {
      tokenBudget: 100, // maxChars is 350 chars
    });

    expect(typeof summary).toBe("string");
    expect(summary).toContain(
      "additional files truncated to preserve token budget",
    );
  });
});
