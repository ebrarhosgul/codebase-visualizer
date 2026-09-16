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

  it("lays out collapsed folder summary cards as standalone macro-nodes (AC-4)", () => {
    const nodes: CodebaseReactFlowNode[] = [
      {
        id: "folder-group:src/components",
        type: "collapsedFolder",
        position: { x: 0, y: 0 },
        data: {
          entityType: "collapsedFolder",
          label: "src/components",
          fileCount: 5,
          dominantLayerId: "components",
          externalImportCount: 2,
          externalExportCount: 4,
          entity: {
            directoryId: "folder-group:src/components",
            path: "src/components",
            fileCount: 5,
            dominantLayerId: "components",
            externalImportCount: 2,
            externalExportCount: 4,
            childFileIds: ["file:1", "file:2"],
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
        id: "bundled:folder-group:src/components->file:src/utils.ts",
        source: "folder-group:src/components",
        target: "file:src/utils.ts",
        type: "file_import",
        data: {
          kind: "file_import",
          weight: 4,
          isExternal: false,
          isBundled: true,
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

    // The collapsed folder should be positioned directly without a folderGroup wrapper
    const collapsedCard = laidOut.nodes.find(
      (n) => n.id === "folder-group:src/components",
    );
    expect(collapsedCard).toBeDefined();
    expect(collapsedCard?.type).toBe("collapsedFolder");

    const utilsCard = laidOut.nodes.find((n) => n.id === "file:src/utils.ts");
    expect(utilsCard).toBeDefined();

    if (collapsedCard && utilsCard) {
      expect(utilsCard.position.x).toBeGreaterThan(collapsedCard.position.x);
    }
  });

  it("packs remaining visible nodes neatly after excluded nodes are pruned (AC-3)", () => {
    // When elements are pruned down to 1 file in components and 1 file in lib
    const prunedNodes: CodebaseReactFlowNode[] = [
      {
        id: "file:src/components/button.tsx",
        type: "file",
        position: { x: 0, y: 0 },
        data: {
          entityType: "file",
          label: "button.tsx",
          entity: {
            id: "file:src/components/button.tsx",
            path: "src/components/button.tsx",
            name: "button.tsx",
            extension: ".tsx",
            language: "typescript",
            sizeBytes: 100,
            lineCount: 10,
            directoryId: "dir:src/components",
            symbolIds: [],
            importIds: [],
            exportIds: [],
          },
        },
      },
    ];

    const elements: ReactFlowElements = {
      nodes: Object.freeze(prunedNodes),
      edges: Object.freeze([]),
    };

    const laidOut = computeDagreLayout(elements, {
      direction: "LR",
      groupByFolder: true,
    });

    // Should only have 1 folderGroup (src/components) and 1 file node
    expect(laidOut.nodes.length).toBe(2);
    const folderGroup = laidOut.nodes.find((n) => n.type === "folderGroup");
    expect(folderGroup).toBeDefined();
    expect(folderGroup?.id).toBe("folder-group:src/components");
  });

  it("ensures child cards in folder group remain strictly within container width bounds", () => {
    const nodes: CodebaseReactFlowNode[] = [];
    for (let i = 0; i < 7; i++) {
      const filePath = `src/very_long_file_name_specifier_number_${i}.tsx`;
      nodes.push({
        id: `file:${filePath}`,
        type: "file",
        position: { x: 0, y: 0 },
        data: {
          entityType: "file",
          label: `very_long_file_name_specifier_number_${i}.tsx`,
          entity: {
            id: `file:${filePath}`,
            path: filePath,
            name: `very_long_file_name_specifier_number_${i}.tsx`,
            extension: ".tsx",
            language: "typescript",
            sizeBytes: 100,
            lineCount: 10,
            directoryId: "dir:src",
            symbolIds: [],
            importIds: [],
            exportIds: [],
          },
        },
      });
    }

    const laidOut = computeDagreLayout(
      { nodes: Object.freeze(nodes), edges: Object.freeze([]) },
      { direction: "LR", groupByFolder: true, nodeWidth: 240 },
    );

    const folderNode = laidOut.nodes.find((n) => n.type === "folderGroup");
    expect(folderNode).toBeDefined();
    const folderWidth = Number(folderNode?.style?.width ?? 0);
    const folderLeft = folderNode?.position.x ?? 0;

    const childNodes = laidOut.nodes.filter((n) => n.type === "file");
    expect(childNodes.length).toBe(7);

    for (const child of childNodes) {
      expect(child.position.x).toBeGreaterThanOrEqual(folderLeft);
      expect(child.position.x + 240).toBeLessThanOrEqual(
        folderLeft + folderWidth,
      );
    }
  });

  it("clusters symbol nodes inside their parent file directory container (AC-3, AC-4)", () => {
    const fileNode: CodebaseReactFlowNode = {
      id: "file:src/service.ts",
      type: "file",
      position: { x: 0, y: 0 },
      data: {
        entityType: "file",
        label: "service.ts",
        entity: {
          id: "file:src/service.ts",
          path: "src/service.ts",
          name: "service.ts",
          extension: ".ts",
          language: "typescript",
          sizeBytes: 100,
          lineCount: 10,
          directoryId: "dir:src",
          symbolIds: ["symbol:src/service.ts#fetchData"],
          importIds: [],
          exportIds: [],
        },
      },
    };

    const symbolNode: CodebaseReactFlowNode = {
      id: "symbol:src/service.ts#fetchData",
      type: "symbol",
      position: { x: 0, y: 0 },
      hidden: true,
      data: {
        entityType: "symbol",
        label: "fetchData",
        entity: {
          id: "symbol:src/service.ts#fetchData",
          fileId: "file:src/service.ts",
          parentSymbolId: null,
          name: "fetchData",
          kind: "function",
          range: {
            startOffset: 0,
            endOffset: 50,
            startLine: 1,
            startColumn: 1,
            endLine: 5,
            endColumn: 2,
          },
          selectionRange: {
            startOffset: 0,
            endOffset: 10,
            startLine: 1,
            startColumn: 1,
            endLine: 1,
            endColumn: 10,
          },
          isExported: true,
          isDefaultExport: false,
          signature: "export function fetchData(): Promise<void>",
          documentation: null,
          visibility: "public",
          childSymbolIds: [],
        },
      },
    };

    const laidOut = computeDagreLayout(
      {
        nodes: Object.freeze([fileNode, symbolNode]),
        edges: Object.freeze([]),
      },
      { direction: "LR", groupByFolder: true, nodeWidth: 240 },
    );

    const folderNode = laidOut.nodes.find((n) => n.type === "folderGroup");
    expect(folderNode).toBeDefined();

    const laidOutSymbol = laidOut.nodes.find(
      (n) => n.id === "symbol:src/service.ts#fetchData",
    );
    expect(laidOutSymbol).toBeDefined();

    const folderLeft = folderNode?.position.x ?? 0;
    const folderWidth = Number(folderNode?.style?.width ?? 0);
    expect(laidOutSymbol?.position.x).toBeGreaterThanOrEqual(folderLeft);
    expect(laidOutSymbol!.position.x + 240).toBeLessThanOrEqual(
      folderLeft + folderWidth,
    );
  });

  it("clusters root level file symbols into root folder group container", () => {
    const rootFileNode: CodebaseReactFlowNode = {
      id: "file:main.ts",
      type: "file",
      position: { x: 0, y: 0 },
      data: {
        entityType: "file",
        label: "main.ts",
        entity: {
          id: "file:main.ts",
          path: "main.ts",
          name: "main.ts",
          extension: ".ts",
          language: "typescript",
          sizeBytes: 100,
          lineCount: 10,
          directoryId: "dir:(root)",
          symbolIds: ["symbol:main.ts#bootstrap"],
          importIds: [],
          exportIds: [],
        },
      },
    };

    const rootSymbolNode: CodebaseReactFlowNode = {
      id: "symbol:main.ts#bootstrap",
      type: "symbol",
      position: { x: 0, y: 0 },
      hidden: true,
      data: {
        entityType: "symbol",
        label: "bootstrap",
        entity: {
          id: "symbol:main.ts#bootstrap",
          fileId: "file:main.ts",
          parentSymbolId: null,
          name: "bootstrap",
          kind: "function",
          range: {
            startOffset: 0,
            endOffset: 50,
            startLine: 1,
            startColumn: 1,
            endLine: 5,
            endColumn: 2,
          },
          selectionRange: {
            startOffset: 0,
            endOffset: 9,
            startLine: 1,
            startColumn: 1,
            endLine: 1,
            endColumn: 10,
          },
          isExported: true,
          isDefaultExport: false,
          signature: "export function bootstrap(): void",
          documentation: null,
          visibility: "public",
          childSymbolIds: [],
        },
      },
    };

    const laidOut = computeDagreLayout(
      {
        nodes: Object.freeze([rootFileNode, rootSymbolNode]),
        edges: Object.freeze([]),
      },
      { direction: "LR", groupByFolder: true, nodeWidth: 240 },
    );

    const rootFolder = laidOut.nodes.find(
      (n) => n.id === "folder-group:(root)",
    );
    expect(rootFolder).toBeDefined();

    const fileResult = laidOut.nodes.find((n) => n.id === "file:main.ts");
    const symbolResult = laidOut.nodes.find(
      (n) => n.id === "symbol:main.ts#bootstrap",
    );
    expect(fileResult).toBeDefined();
    expect(symbolResult).toBeDefined();

    expect(fileResult!.position.y).toBeLessThan(symbolResult!.position.y);
  });
});
