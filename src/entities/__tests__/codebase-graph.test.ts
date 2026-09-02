import { describe, it, expect } from "vitest";
import {
  createEmptyCodebaseGraph,
  type CodebaseGraph,
} from "../codebase-graph";
import {
  serializeCodebaseGraph,
  deserializeCodebaseGraph,
} from "../serialization";
import { createRepositoryId, CURRENT_SCHEMA_VERSION } from "../repository";
import { createDirectoryId } from "../directory";
import { createFileId } from "../file";
import { createSymbolId } from "../symbol";
import { createGraphEdge } from "../edge";
import { createExternalModuleId } from "../external";

describe("Canonical Root Graph and Serialization (AC-1, AC-7)", () => {
  const sampleRepo = {
    id: createRepositoryId("acme", "project"),
    owner: "acme",
    name: "project",
    fullName: "acme/project",
    defaultBranch: "main",
    commitSha: "9f8e7d6c5b4a",
    analyzedAt: "2026-09-02T19:00:00.000Z",
    totalFiles: 1,
    totalSymbols: 1,
    languages: { TypeScript: 100 },
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };

  function createSampleGraph(): CodebaseGraph {
    const dirId = createDirectoryId("src");
    const fileId = createFileId("src/index.ts");
    const symbolId = createSymbolId("src/index.ts", "main");
    const extId = createExternalModuleId("react");
    const edge = createGraphEdge({
      sourceId: fileId,
      targetId: extId,
      kind: "file_import",
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
          childFileIds: [fileId],
        },
      },
      files: {
        [fileId]: {
          id: fileId,
          path: "src/index.ts",
          name: "index.ts",
          extension: ".ts",
          language: "typescript",
          sizeBytes: 500,
          lineCount: 20,
          directoryId: dirId,
          symbolIds: [symbolId],
          importIds: [extId],
          exportIds: [],
        },
      },
      symbols: {
        [symbolId]: {
          id: symbolId,
          fileId,
          parentSymbolId: null,
          name: "main",
          kind: "function",
          range: {
            startLine: 1,
            startColumn: 1,
            endLine: 10,
            endColumn: 2,
            startOffset: 0,
            endOffset: 120,
          },
          selectionRange: {
            startLine: 1,
            startColumn: 10,
            endLine: 1,
            endColumn: 14,
            startOffset: 9,
            endOffset: 13,
          },
          isExported: true,
          isDefaultExport: false,
          signature: "export function main(): void",
          documentation: "Entry point function.",
          visibility: "public",
          childSymbolIds: [],
        },
      },
      externalModules: {
        [extId]: {
          id: extId,
          name: "react",
          isExternal: true,
        },
      },
      edges: {
        [edge.id]: edge,
      },
    };
  }

  it("initializes an empty CodebaseGraph container", () => {
    const emptyGraph = createEmptyCodebaseGraph(sampleRepo);
    expect(emptyGraph.schemaVersion).toBe(1);
    expect(emptyGraph.repository.id).toBe("repo:acme/project");
    expect(Object.keys(emptyGraph.files)).toHaveLength(0);
  });

  it("serializes and deserializes a CodebaseGraph round trip cleanly", () => {
    const original = createSampleGraph();
    const serialized = serializeCodebaseGraph(original);
    expect(typeof serialized).toBe("string");

    const result = deserializeCodebaseGraph(serialized);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(original);
      expect(
        result.data.edges[Object.keys(result.data.edges)[0]].isExternal,
      ).toBe(true);
    }
  });

  it("deserializes directly from object payload", () => {
    const original = createSampleGraph();
    const result = deserializeCodebaseGraph(original);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.repository.name).toBe("project");
    }
  });

  it("rejects payloads with outdated schemaVersion returning VERSION_MISMATCH", () => {
    const outdatedPayload = {
      ...createSampleGraph(),
      schemaVersion: 999,
    };

    const result = deserializeCodebaseGraph(outdatedPayload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("VERSION_MISMATCH");
      expect(result.error.expectedVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(result.error.receivedVersion).toBe(999);
    }
  });

  it("returns JSON_PARSE_ERROR on malformed JSON string", () => {
    const result = deserializeCodebaseGraph("{ malformed json");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("JSON_PARSE_ERROR");
    }
  });

  it("returns SCHEMA_ERROR on missing or invalid required entities", () => {
    const invalidPayload = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      repository: { invalid: true },
    };

    const result = deserializeCodebaseGraph(invalidPayload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("SCHEMA_ERROR");
      expect(result.error.issues).toBeDefined();
    }
  });
});
