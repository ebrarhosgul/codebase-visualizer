import { describe, it, expect } from "vitest";
import { computeDagreLayout } from "../dagre-layout";
import type {
  ReactFlowElements,
  CodebaseReactFlowNode,
  CodebaseReactFlowEdge,
} from "../../adapters/react-flow-adapter";

describe("computeDagreLayout", () => {
  it("returns unchanged elements when node array is empty", () => {
    const emptyElements: ReactFlowElements = {
      nodes: Object.freeze([]),
      edges: Object.freeze([]),
    };

    const result = computeDagreLayout(emptyElements);
    expect(result.nodes.length).toBe(0);
    expect(result.edges.length).toBe(0);
  });

  it("assigns non overlapping coordinates in top to bottom hierarchy (AC-5)", () => {
    const nodes: CodebaseReactFlowNode[] = [
      {
        id: "file:src/index.ts",
        type: "file",
        position: { x: 0, y: 0 },
        data: {
          entityType: "file",
          label: "index.ts",
          entity: {
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
        },
      },
      {
        id: "file:src/utils.ts",
        type: "file",
        position: { x: 0, y: 0 },
        data: {
          entityType: "file",
          label: "utils.ts",
          entity: {
            id: "file:src/utils.ts",
            path: "src/utils.ts",
            name: "utils.ts",
            extension: ".ts",
            language: "typescript",
            sizeBytes: 50,
            lineCount: 5,
            directoryId: "dir:src",
            symbolIds: [],
            importIds: [],
            exportIds: [],
          },
        },
      },
    ];

    const edges: CodebaseReactFlowEdge[] = [
      {
        id: "edge:file:src/index.ts->file:src/utils.ts:file_import",
        source: "file:src/index.ts",
        target: "file:src/utils.ts",
        type: "file_import",
        data: {
          kind: "file_import",
          weight: 1,
          isExternal: false,
        },
      },
    ];

    const elements: ReactFlowElements = {
      nodes: Object.freeze(nodes),
      edges: Object.freeze(edges),
    };

    const laidOut = computeDagreLayout(elements, { direction: "TB" });

    expect(laidOut.nodes.length).toBe(2);
    const sourceNode = laidOut.nodes.find((n) => n.id === "file:src/index.ts");
    const targetNode = laidOut.nodes.find((n) => n.id === "file:src/utils.ts");

    expect(sourceNode).toBeDefined();
    expect(targetNode).toBeDefined();

    // Target node should be below source node in TB hierarchy
    if (sourceNode && targetNode) {
      expect(targetNode.position.y).toBeGreaterThan(sourceNode.position.y);
    }
  });
});
