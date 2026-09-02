import { describe, it, expect } from "vitest";
import {
  edgeKindSchema,
  graphEdgeSchema,
  createEdgeId,
  createGraphEdge,
  aggregateEdge,
  type GraphEdge,
  type EdgeKind,
} from "../edge";
import { type SourceLocation } from "../source-location";

describe("GraphEdge Taxonomy and Aggregation (AC-2, AC-4)", () => {
  const dummyLocation1: SourceLocation = {
    startLine: 12,
    startColumn: 5,
    endLine: 12,
    endColumn: 20,
    startOffset: 240,
    endOffset: 255,
  };

  const dummyLocation2: SourceLocation = {
    startLine: 35,
    startColumn: 3,
    endLine: 35,
    endColumn: 18,
    startOffset: 650,
    endOffset: 665,
  };

  it("generates deterministic edge IDs", () => {
    const edgeId = createEdgeId(
      "file:src/app.tsx",
      "file:src/utils.ts",
      "file_import",
    );
    expect(edgeId).toBe("edge:file:src/app.tsx->file:src/utils.ts:file_import");
  });

  it("validates all edge taxonomy kinds", () => {
    const kinds: readonly EdgeKind[] = [
      "file_import",
      "re_export",
      "call",
      "type_reference",
      "heritage",
      "contains",
    ];

    for (const kind of kinds) {
      expect(edgeKindSchema.parse(kind)).toBe(kind);
      const edge = createGraphEdge({
        sourceId: "file:src/a.ts",
        targetId: "file:src/b.ts",
        kind,
      });
      expect(edge.kind).toBe(kind);
      expect(edge.weight).toBe(1);
      expect(edge.isExternal).toBe(false);
    }
  });

  it("auto detects external modules from targetId prefix", () => {
    const edge = createGraphEdge({
      sourceId: "file:src/index.ts",
      targetId: "ext:react",
      kind: "file_import",
    });

    expect(edge.isExternal).toBe(true);
    expect(edge.id).toBe("edge:file:src/index.ts->ext:react:file_import");
  });

  it("aggregates repeated edges by incrementing weight and accumulating call sites", () => {
    const initialEdge: GraphEdge = createGraphEdge({
      sourceId: "symbol:src/service.ts#process",
      targetId: "symbol:src/utils.ts#helper",
      kind: "call",
      metadata: {
        callSites: [dummyLocation1],
      },
    });

    expect(initialEdge.weight).toBe(1);
    expect(initialEdge.metadata?.callSites).toHaveLength(1);

    const aggregated = aggregateEdge(initialEdge, {
      callSites: [dummyLocation2],
      weightIncrement: 1,
    });

    // Original edge remains immutable
    expect(initialEdge.weight).toBe(1);
    expect(initialEdge.metadata?.callSites).toHaveLength(1);

    // Aggregated edge contains both call sites and incremented weight
    expect(aggregated.weight).toBe(2);
    expect(aggregated.metadata?.callSites).toHaveLength(2);
    expect(aggregated.metadata?.callSites?.[0]).toEqual(dummyLocation1);
    expect(aggregated.metadata?.callSites?.[1]).toEqual(dummyLocation2);
  });

  it("merges import specifiers without duplicate entries", () => {
    const initialEdge = createGraphEdge({
      sourceId: "file:src/app.tsx",
      targetId: "ext:react",
      kind: "file_import",
      metadata: {
        importSpecifiers: ["useState"],
      },
    });

    const aggregated = aggregateEdge(initialEdge, {
      importSpecifiers: ["useState", "useEffect"],
    });

    expect(aggregated.weight).toBe(2);
    expect(aggregated.metadata?.importSpecifiers).toEqual([
      "useState",
      "useEffect",
    ]);
  });

  it("rejects invalid edge configurations", () => {
    expect(() =>
      graphEdgeSchema.parse({
        id: "invalid-id",
        sourceId: "",
        targetId: "ext:react",
        kind: "unknown_kind",
        weight: 0,
        isExternal: false,
      }),
    ).toThrow();
  });
});
