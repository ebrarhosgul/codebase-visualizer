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

  it("creates compound folderGroup container nodes when groupByFolder is true in LR layout", () => {
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
        id: "file:lib/api.ts",
        type: "file",
        position: { x: 0, y: 0 },
        data: {
          entityType: "file",
          label: "api.ts",
          entity: {
            id: "file:lib/api.ts",
            path: "lib/api.ts",
            name: "api.ts",
            extension: ".ts",
            language: "typescript",
            sizeBytes: 80,
            lineCount: 8,
            directoryId: "dir:lib",
            symbolIds: [],
            importIds: [],
            exportIds: [],
          },
        },
      },
    ];

    const edges: CodebaseReactFlowEdge[] = [
      {
        id: "edge:file:src/index.ts->file:lib/api.ts:file_import",
        source: "file:src/index.ts",
        target: "file:lib/api.ts",
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

    const laidOut = computeDagreLayout(elements, {
      direction: "LR",
      groupByFolder: true,
    });

    // Should contain 2 folderGroup nodes + 2 file nodes = 4 nodes total
    expect(laidOut.nodes.length).toBe(4);

    const folderNodes = laidOut.nodes.filter((n) => n.type === "folderGroup");
    expect(folderNodes.length).toBe(2);

    const srcFolder = folderNodes.find((n) => n.id === "folder-group:src");
    const libFolder = folderNodes.find((n) => n.id === "folder-group:lib");
    expect(srcFolder).toBeDefined();
    expect(libFolder).toBeDefined();

    const fileIndex = laidOut.nodes.find((n) => n.id === "file:src/index.ts");
    const fileApi = laidOut.nodes.find((n) => n.id === "file:lib/api.ts");

    expect(fileIndex).toBeDefined();
    expect(fileApi).toBeDefined();

    // In LR layout, fileApi should be to the right of fileIndex (or on subsequent rank)
    if (fileIndex && fileApi) {
      expect(fileApi.position.x).toBeGreaterThan(fileIndex.position.x);
    }
  });

  it("guarantees zero bounding box overlap between multiple folder containers", () => {
    // 3 folders with multiple files and cross-folder edges
    const folders = ["components/flight", "lib", "entities"];
    const nodes: CodebaseReactFlowNode[] = [];

    folders.forEach((folder) => {
      for (let i = 0; i < 3; i++) {
        const filePath = `${folder}/file${i}.ts`;
        nodes.push({
          id: `file:${filePath}`,
          type: "file",
          position: { x: 0, y: 0 },
          data: {
            entityType: "file",
            label: `file${i}.ts`,
            entity: {
              id: `file:${filePath}`,
              path: filePath,
              name: `file${i}.ts`,
              extension: ".ts",
              language: "typescript",
              sizeBytes: 100,
              lineCount: 10,
              directoryId: `dir:${folder}`,
              symbolIds: [],
              importIds: [],
              exportIds: [],
            },
          },
        });
      }
    });

    const edges: CodebaseReactFlowEdge[] = [
      {
        id: "e1",
        source: "file:components/flight/file0.ts",
        target: "file:lib/file1.ts",
        type: "file_import",
      },
      {
        id: "e2",
        source: "file:lib/file1.ts",
        target: "file:entities/file2.ts",
        type: "file_import",
      },
      {
        id: "e3",
        source: "file:components/flight/file2.ts",
        target: "file:entities/file0.ts",
        type: "file_import",
      },
    ];

    const laidOut = computeDagreLayout(
      { nodes: Object.freeze(nodes), edges: Object.freeze(edges) },
      { direction: "LR", groupByFolder: true },
    );

    const folderNodes = laidOut.nodes.filter((n) => n.type === "folderGroup");
    expect(folderNodes.length).toBe(3);

    // Verify each folder container does not overlap with any other folder container
    for (let i = 0; i < folderNodes.length; i++) {
      for (let j = i + 1; j < folderNodes.length; j++) {
        const a = folderNodes[i]!;
        const b = folderNodes[j]!;

        const aLeft = a.position.x;
        const aRight = aLeft + Number(a.style?.width ?? 0);
        const aTop = a.position.y;
        const aBottom = aTop + Number(a.style?.height ?? 0);

        const bLeft = b.position.x;
        const bRight = bLeft + Number(b.style?.width ?? 0);
        const bTop = b.position.y;
        const bBottom = bTop + Number(b.style?.height ?? 0);

        const overlapsHorizontally = aLeft < bRight && aRight > bLeft;
        const overlapsVertically = aTop < bBottom && aBottom > bTop;
        const isOverlapping = overlapsHorizontally && overlapsVertically;

        expect(isOverlapping).toBe(false);
      }
    }
  });
});
