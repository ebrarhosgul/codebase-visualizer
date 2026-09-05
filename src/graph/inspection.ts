import type { CodebaseGraph, FileNode } from "@/entities";
import { type ArchitecturalLayerId, classifyLayerForPath } from "./layers";
import { computeDominantLayer, normalizeFolderKey } from "./filtering";

export interface DependencyReference {
  readonly edgeId: string;
  readonly sourceFileId: string;
  readonly sourceFileName: string;
  readonly sourceSymbolId: string | null;
  readonly sourceSymbolName: string | null;
  readonly targetFileId: string;
  readonly targetFileName: string;
  readonly targetSymbolId: string | null;
  readonly targetSymbolName: string | null;
  readonly dependencyKind: "import" | "call" | "re_export";
  readonly callLine: number | null;
}

export interface NodeMetrics {
  readonly fanIn: number;
  readonly fanOut: number;
  readonly lineCount: number;
  readonly symbolCount: number;
}

export interface SymbolSummary {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly line: number;
  readonly isExported: boolean;
}

export interface DirectoryConstituent {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly lineCount: number;
  readonly layerId: ArchitecturalLayerId;
}

export interface DirectoryInspectionDetails {
  readonly totalFiles: number;
  readonly totalSymbols: number;
  readonly dominantLayerId: ArchitecturalLayerId;
  readonly externalIncomingCount: number;
  readonly externalOutgoingCount: number;
  readonly fileList: readonly DirectoryConstituent[];
}

export interface NodeInspectionDetail {
  readonly nodeId: string;
  readonly entityType: "file" | "symbol" | "directory";
  readonly displayName: string;
  readonly filePath: string;
  readonly layerId: ArchitecturalLayerId;
  readonly incomingDependencies: readonly DependencyReference[];
  readonly outgoingDependencies: readonly DependencyReference[];
  readonly exportedSymbols: readonly SymbolSummary[];
  readonly internalSymbols: readonly SymbolSummary[];
  readonly metrics: NodeMetrics;
  readonly isVisibleOnCanvas: boolean;
  readonly directoryDetails?: DirectoryInspectionDetails;
}

/**
 * Calculates structural inspection details for the selected node.
 * Evaluates incoming callers, outgoing callees, symbol declarations, and directory metrics.
 */
export function getNodeInspectionDetail(
  graph: CodebaseGraph | null,
  nodeId: string | null,
  isVisibleOnCanvas = true,
): NodeInspectionDetail | null {
  if (!graph || !nodeId) {
    return null;
  }

  // 1. Directory or Collapsed Folder Scope
  if (
    nodeId.startsWith("dir:") ||
    nodeId.startsWith("folder-group:") ||
    nodeId.startsWith("directory:")
  ) {
    const folderPath = normalizeFolderKey(nodeId);
    const constituentFiles: FileNode[] = [];

    for (const file of Object.values(graph.files)) {
      const normalizedPath = file.path.replace(/\\/g, "/");
      if (
        normalizedPath === folderPath ||
        normalizedPath.startsWith(`${folderPath}/`)
      ) {
        constituentFiles.push(file);
      }
    }

    if (constituentFiles.length === 0) {
      return null;
    }

    const constituentFileIds = new Set(constituentFiles.map((f) => f.id));
    const dominantLayerId = computeDominantLayer(constituentFiles);

    let totalSymbols = 0;
    for (const file of constituentFiles) {
      totalSymbols += file.symbolIds.length;
    }

    const incomingDeps: DependencyReference[] = [];
    const outgoingDeps: DependencyReference[] = [];

    for (const edge of Object.values(graph.edges)) {
      const sourceInFolder = constituentFileIds.has(edge.sourceId);
      const targetInFolder = constituentFileIds.has(edge.targetId);

      // Edge crossing into folder
      if (!sourceInFolder && targetInFolder) {
        const sourceFile = graph.files[edge.sourceId];
        const targetFile = graph.files[edge.targetId];
        incomingDeps.push({
          edgeId: edge.id,
          sourceFileId: edge.sourceId,
          sourceFileName: sourceFile?.name ?? edge.sourceId,
          sourceSymbolId: null,
          sourceSymbolName: null,
          targetFileId: edge.targetId,
          targetFileName: targetFile?.name ?? edge.targetId,
          targetSymbolId: null,
          targetSymbolName: null,
          dependencyKind: "import",
          callLine: null,
        });
      }

      // Edge crossing out of folder
      if (sourceInFolder && !targetInFolder) {
        const sourceFile = graph.files[edge.sourceId];
        const targetFile = graph.files[edge.targetId];
        outgoingDeps.push({
          edgeId: edge.id,
          sourceFileId: edge.sourceId,
          sourceFileName: sourceFile?.name ?? edge.sourceId,
          sourceSymbolId: null,
          sourceSymbolName: null,
          targetFileId: edge.targetId,
          targetFileName: targetFile?.name ?? edge.targetId,
          targetSymbolId: null,
          targetSymbolName: null,
          dependencyKind: "import",
          callLine: null,
        });
      }
    }

    const fileList: DirectoryConstituent[] = constituentFiles.map((f) => ({
      id: f.id,
      name: f.name,
      path: f.path,
      lineCount: f.lineCount,
      layerId: classifyLayerForPath(f.path),
    }));

    return Object.freeze({
      nodeId,
      entityType: "directory",
      displayName: folderPath,
      filePath: folderPath,
      layerId: dominantLayerId,
      incomingDependencies: Object.freeze(incomingDeps),
      outgoingDependencies: Object.freeze(outgoingDeps),
      exportedSymbols: Object.freeze([]),
      internalSymbols: Object.freeze([]),
      metrics: {
        fanIn: incomingDeps.length,
        fanOut: outgoingDeps.length,
        lineCount: constituentFiles.reduce((acc, f) => acc + f.lineCount, 0),
        symbolCount: totalSymbols,
      },
      isVisibleOnCanvas,
      directoryDetails: {
        totalFiles: constituentFiles.length,
        totalSymbols,
        dominantLayerId,
        externalIncomingCount: incomingDeps.length,
        externalOutgoingCount: outgoingDeps.length,
        fileList: Object.freeze(fileList),
      },
    });
  }

  // 2. Symbol Scope
  if (nodeId.startsWith("symbol:")) {
    const symbol = graph.symbols[nodeId];
    if (!symbol) {
      return null;
    }

    const parentFile = graph.files[symbol.fileId];
    const layerId = parentFile
      ? classifyLayerForPath(parentFile.path)
      : "other";

    const incomingDeps: DependencyReference[] = [];
    const outgoingDeps: DependencyReference[] = [];

    for (const edge of Object.values(graph.edges)) {
      if (edge.targetId === symbol.id || edge.targetId === symbol.fileId) {
        const sourceFile = graph.files[edge.sourceId];
        const sourceSym = graph.symbols[edge.sourceId];
        incomingDeps.push({
          edgeId: edge.id,
          sourceFileId: sourceSym?.fileId ?? edge.sourceId,
          sourceFileName: sourceFile?.name ?? sourceSym?.name ?? edge.sourceId,
          sourceSymbolId: sourceSym?.id ?? null,
          sourceSymbolName: sourceSym?.name ?? null,
          targetFileId: symbol.fileId,
          targetFileName: parentFile?.name ?? symbol.fileId,
          targetSymbolId: symbol.id,
          targetSymbolName: symbol.name,
          dependencyKind: edge.kind === "call" ? "call" : "import",
          callLine: edge.metadata?.callSites?.[0]?.startLine ?? null,
        });
      }

      if (edge.sourceId === symbol.id || edge.sourceId === symbol.fileId) {
        const targetFile = graph.files[edge.targetId];
        const targetSym = graph.symbols[edge.targetId];
        outgoingDeps.push({
          edgeId: edge.id,
          sourceFileId: symbol.fileId,
          sourceFileName: parentFile?.name ?? symbol.fileId,
          sourceSymbolId: symbol.id,
          sourceSymbolName: symbol.name,
          targetFileId: targetSym?.fileId ?? edge.targetId,
          targetFileName: targetFile?.name ?? targetSym?.name ?? edge.targetId,
          targetSymbolId: targetSym?.id ?? null,
          targetSymbolName: targetSym?.name ?? null,
          dependencyKind: edge.kind === "call" ? "call" : "import",
          callLine: edge.metadata?.callSites?.[0]?.startLine ?? null,
        });
      }
    }

    return Object.freeze({
      nodeId,
      entityType: "symbol",
      displayName: symbol.name,
      filePath: parentFile?.path ?? symbol.fileId,
      layerId,
      incomingDependencies: Object.freeze(incomingDeps),
      outgoingDependencies: Object.freeze(outgoingDeps),
      exportedSymbols: Object.freeze([]),
      internalSymbols: Object.freeze([]),
      metrics: {
        fanIn: incomingDeps.length,
        fanOut: outgoingDeps.length,
        lineCount: symbol.range.endLine - symbol.range.startLine + 1,
        symbolCount: 1,
      },
      isVisibleOnCanvas,
    });
  }

  // 3. File Scope (default)
  const file = graph.files[nodeId];
  if (!file) {
    return null;
  }

  const layerId = classifyLayerForPath(file.path);

  const incomingDeps: DependencyReference[] = [];
  const outgoingDeps: DependencyReference[] = [];

  for (const edge of Object.values(graph.edges)) {
    if (edge.targetId === file.id) {
      const sourceFile = graph.files[edge.sourceId];
      const sourceSym = graph.symbols[edge.sourceId];
      incomingDeps.push({
        edgeId: edge.id,
        sourceFileId: sourceSym?.fileId ?? edge.sourceId,
        sourceFileName: sourceFile?.name ?? sourceSym?.name ?? edge.sourceId,
        sourceSymbolId: sourceSym?.id ?? null,
        sourceSymbolName: sourceSym?.name ?? null,
        targetFileId: file.id,
        targetFileName: file.name,
        targetSymbolId: null,
        targetSymbolName: null,
        dependencyKind: edge.kind === "re_export" ? "re_export" : "import",
        callLine: edge.metadata?.callSites?.[0]?.startLine ?? null,
      });
    }

    if (edge.sourceId === file.id) {
      const targetFile = graph.files[edge.targetId];
      const targetSym = graph.symbols[edge.targetId];
      outgoingDeps.push({
        edgeId: edge.id,
        sourceFileId: file.id,
        sourceFileName: file.name,
        sourceSymbolId: null,
        sourceSymbolName: null,
        targetFileId: targetSym?.fileId ?? edge.targetId,
        targetFileName: targetFile?.name ?? targetSym?.name ?? edge.targetId,
        targetSymbolId: targetSym?.id ?? null,
        targetSymbolName: targetSym?.name ?? null,
        dependencyKind: edge.kind === "re_export" ? "re_export" : "import",
        callLine: edge.metadata?.callSites?.[0]?.startLine ?? null,
      });
    }
  }

  const exportedSymbols: SymbolSummary[] = [];
  const internalSymbols: SymbolSummary[] = [];

  for (const symbolId of file.symbolIds) {
    const sym = graph.symbols[symbolId];
    if (sym) {
      const summary: SymbolSummary = {
        id: sym.id,
        name: sym.name,
        kind: sym.kind,
        line: sym.range.startLine,
        isExported: sym.isExported,
      };

      if (sym.isExported) {
        exportedSymbols.push(summary);
      } else {
        internalSymbols.push(summary);
      }
    }
  }

  return Object.freeze({
    nodeId: file.id,
    entityType: "file",
    displayName: file.name,
    filePath: file.path,
    layerId,
    incomingDependencies: Object.freeze(incomingDeps),
    outgoingDependencies: Object.freeze(outgoingDeps),
    exportedSymbols: Object.freeze(exportedSymbols),
    internalSymbols: Object.freeze(internalSymbols),
    metrics: {
      fanIn: incomingDeps.length,
      fanOut: outgoingDeps.length,
      lineCount: file.lineCount,
      symbolCount: file.symbolIds.length,
    },
    isVisibleOnCanvas,
  });
}
