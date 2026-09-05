import type {
  CodebaseGraph,
  FileNode,
  DirectoryNode,
  ExternalModuleNode,
  GraphEdge,
} from "@/entities";
import {
  type ArchitecturalLayerId,
  classifyLayerForPath,
  getLayerDefinition,
} from "./layers";
import type { GraphFilterState } from "@/stores/graph-store";

export interface CollapsedFolderSummary {
  readonly directoryId: string;
  readonly path: string;
  readonly fileCount: number;
  readonly dominantLayerId: ArchitecturalLayerId;
  readonly externalImportCount: number;
  readonly externalExportCount: number;
  readonly childFileIds: readonly string[];
}

export interface FilteredGraphResult {
  readonly visibleFiles: readonly FileNode[];
  readonly visibleDirectories: readonly DirectoryNode[];
  readonly collapsedFolders: readonly CollapsedFolderSummary[];
  readonly visibleExternalModules: readonly ExternalModuleNode[];
  readonly visibleEdges: readonly GraphEdge[];
  readonly bundledEdges: readonly GraphEdge[];
  readonly nodeRepresentationMap: Readonly<Record<string, string>>;
}

/**
 * Normalizes folder path by removing folder-group or dir prefixes and surrounding slashes.
 */
export function normalizeFolderKey(raw: string): string {
  return raw
    .replace(/^(folder-group:|dir:)/, "")
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");
}

/**
 * Determines the outermost collapsed folder ancestors.
 * If both parent and child directories are collapsed, the outermost ancestor subsumes descendants.
 */
export function resolveOutermostCollapsedFolders(
  collapsedFolderIds: readonly string[],
): readonly string[] {
  if (collapsedFolderIds.length === 0) {
    return Object.freeze([]);
  }

  const normalized = Array.from(
    new Set(collapsedFolderIds.map(normalizeFolderKey).filter(Boolean)),
  );

  // Sort by depth (number of segments ascending), so shorter parent paths come first
  normalized.sort((a, b) => a.split("/").length - b.split("/").length);

  const outermost: string[] = [];

  for (const candidate of normalized) {
    const hasAncestor = outermost.some(
      (parent) => candidate === parent || candidate.startsWith(`${parent}/`),
    );
    if (!hasAncestor) {
      outermost.push(candidate);
    }
  }

  return Object.freeze(outermost);
}

/**
 * Computes dominant architectural layer for a list of files.
 * Uses majority file count, with ties resolved by lowest rank integer.
 */
export function computeDominantLayer(
  files: readonly FileNode[],
): ArchitecturalLayerId {
  if (files.length === 0) {
    return "other";
  }

  const counts = new Map<ArchitecturalLayerId, number>();

  for (const file of files) {
    const layer = classifyLayerForPath(file.path);
    counts.set(layer, (counts.get(layer) ?? 0) + 1);
  }

  let dominantLayer: ArchitecturalLayerId = "other";
  let maxCount = -1;
  let minRank = 999;

  for (const [layerId, count] of counts.entries()) {
    const def = getLayerDefinition(layerId);
    if (count > maxCount) {
      maxCount = count;
      minRank = def.rank;
      dominantLayer = layerId;
    } else if (count === maxCount && def.rank < minRank) {
      minRank = def.rank;
      dominantLayer = layerId;
    }
  }

  return dominantLayer;
}

/**
 * Performs case-insensitive multi-token matching across file path and symbol names.
 * All whitespace separated tokens must match (AND condition).
 */
export function matchesSearchTokens(
  file: FileNode,
  tokens: readonly string[],
  graph: CodebaseGraph,
): boolean {
  if (tokens.length === 0) {
    return true;
  }

  const normalizedPath = file.path.toLowerCase();
  const normalizedName = file.name.toLowerCase();

  // Collect symbol names for this file
  const symbolNames: string[] = [];
  for (const symbolId of file.symbolIds) {
    const sym = graph.symbols[symbolId];
    if (sym) {
      symbolNames.push(sym.name.toLowerCase());
    }
  }

  // Every token must match somewhere in path, name, or symbols
  return tokens.every((token) => {
    if (normalizedName.includes(token) || normalizedPath.includes(token)) {
      return true;
    }
    return symbolNames.some((symName) => symName.includes(token));
  });
}

/**
 * Pure graph filtering and aggregation function.
 * Evaluates layer selection, hierarchical folder collapse, search query, and external exclusion.
 */
export function filterAndAggregateGraph(
  graph: CodebaseGraph | null,
  filters: GraphFilterState,
): FilteredGraphResult {
  if (!graph || Object.keys(graph.files).length === 0) {
    return Object.freeze({
      visibleFiles: Object.freeze([]),
      visibleDirectories: Object.freeze([]),
      collapsedFolders: Object.freeze([]),
      visibleExternalModules: Object.freeze([]),
      visibleEdges: Object.freeze([]),
      bundledEdges: Object.freeze([]),
      nodeRepresentationMap: Object.freeze({}),
    });
  }

  const searchTokens = filters.searchQuery
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  const layerFilterActive = filters.selectedLayers.length > 0;
  const allowedLayers = new Set<ArchitecturalLayerId>(filters.selectedLayers);

  // 1. Filter files based on layer and search
  const candidateFiles: FileNode[] = [];
  for (const file of Object.values(graph.files)) {
    if (layerFilterActive) {
      const layer = classifyLayerForPath(file.path);
      if (!allowedLayers.has(layer)) {
        continue;
      }
    }

    if (!matchesSearchTokens(file, searchTokens, graph)) {
      continue;
    }

    candidateFiles.push(file);
  }

  // 2. Resolve outermost collapsed folders
  const outermostFolders = resolveOutermostCollapsedFolders(
    filters.collapsedFolderIds,
  );

  // 3. Partition candidate files into uncollapsed visible files vs collapsed folder clusters
  const visibleFiles: FileNode[] = [];
  const folderToFiles = new Map<string, FileNode[]>();
  const nodeRepresentationMap: Record<string, string> = {};

  for (const file of candidateFiles) {
    const normalizedFilePath = file.path.replace(/\\/g, "/");
    let matchedFolder: string | null = null;

    for (const folder of outermostFolders) {
      if (
        normalizedFilePath === folder ||
        normalizedFilePath.startsWith(`${folder}/`)
      ) {
        matchedFolder = folder;
        break;
      }
    }

    if (matchedFolder) {
      const clusterKey = `folder-group:${matchedFolder}`;
      nodeRepresentationMap[file.id] = clusterKey;
      let cluster = folderToFiles.get(matchedFolder);
      if (!cluster) {
        cluster = [];
        folderToFiles.set(matchedFolder, cluster);
      }
      cluster.push(file);
    } else {
      visibleFiles.push(file);
      nodeRepresentationMap[file.id] = file.id;
    }
  }

  // 4. Filter external modules
  const visibleExternalModules: ExternalModuleNode[] = [];
  if (!filters.hideExternal) {
    for (const ext of Object.values(graph.externalModules)) {
      if (searchTokens.length > 0) {
        const extName = ext.name.toLowerCase();
        const matches = searchTokens.every((token) => extName.includes(token));
        if (!matches) continue;
      }
      visibleExternalModules.push(ext);
      nodeRepresentationMap[ext.id] = ext.id;
    }
  }

  // 5. Build CollapsedFolderSummary for each active collapsed folder
  const collapsedFolders: CollapsedFolderSummary[] = [];
  for (const [folderPath, files] of folderToFiles.entries()) {
    const fileIds = files.map((f) => f.id);
    const fileIdSet = new Set(fileIds);
    const dominantLayer = computeDominantLayer(files);

    let externalImportCount = 0;
    let externalExportCount = 0;

    for (const edge of Object.values(graph.edges)) {
      const sourceInFolder = fileIdSet.has(edge.sourceId);
      const targetInFolder = fileIdSet.has(edge.targetId);

      if (sourceInFolder && !targetInFolder) {
        externalExportCount += edge.weight;
      } else if (!sourceInFolder && targetInFolder) {
        externalImportCount += edge.weight;
      }
    }

    collapsedFolders.push(
      Object.freeze({
        directoryId: `folder-group:${folderPath}`,
        path: folderPath,
        fileCount: files.length,
        dominantLayerId: dominantLayer,
        externalImportCount,
        externalExportCount,
        childFileIds: Object.freeze(fileIds),
      }),
    );
  }

  // 6. Partition edges into direct visible edges and bundled edges
  const visibleEdges: GraphEdge[] = [];
  const bundledEdgeMap = new Map<
    string,
    {
      source: string;
      target: string;
      weight: number;
      isExternal: boolean;
      kind: GraphEdge["kind"];
    }
  >();

  for (const edge of Object.values(graph.edges)) {
    const sourceRep = nodeRepresentationMap[edge.sourceId];
    const targetRep = nodeRepresentationMap[edge.targetId];

    // Both endpoints must be visible on canvas
    if (!sourceRep || !targetRep) {
      continue;
    }

    // Edges within the same collapsed folder vanish
    if (sourceRep === targetRep) {
      continue;
    }

    const isSourceCollapsed = sourceRep.startsWith("folder-group:");
    const isTargetCollapsed = targetRep.startsWith("folder-group:");

    if (isSourceCollapsed || isTargetCollapsed) {
      const key = `${sourceRep}->${targetRep}`;
      const existing = bundledEdgeMap.get(key);
      if (existing) {
        existing.weight += edge.weight;
      } else {
        bundledEdgeMap.set(key, {
          source: sourceRep,
          target: targetRep,
          weight: edge.weight,
          isExternal: edge.isExternal,
          kind: edge.kind,
        });
      }
    } else {
      visibleEdges.push(edge);
    }
  }

  // Convert bundled edge map to GraphEdge entities
  const bundledEdges: GraphEdge[] = [];
  for (const [key, bundled] of bundledEdgeMap.entries()) {
    bundledEdges.push(
      Object.freeze({
        id: `bundled:${key}`,
        sourceId: bundled.source,
        targetId: bundled.target,
        kind: bundled.kind,
        weight: bundled.weight,
        isExternal: bundled.isExternal,
        metadata: {
          importSpecifiers: Object.freeze([]),
        },
      }),
    );
  }

  // 7. Determine visible directories
  const visibleDirectories: DirectoryNode[] = [];
  for (const dir of Object.values(graph.directories)) {
    // Only keep directories that have at least one visible file
    const hasVisibleFile = visibleFiles.some((f) => {
      const dirOfFile = f.path.split("/").slice(0, -1).join("/");
      return dirOfFile === dir.path;
    });
    if (hasVisibleFile) {
      visibleDirectories.push(dir);
      nodeRepresentationMap[dir.id] = dir.id;
    }
  }

  return Object.freeze({
    visibleFiles: Object.freeze(visibleFiles),
    visibleDirectories: Object.freeze(visibleDirectories),
    collapsedFolders: Object.freeze(collapsedFolders),
    visibleExternalModules: Object.freeze(visibleExternalModules),
    visibleEdges: Object.freeze(visibleEdges),
    bundledEdges: Object.freeze(bundledEdges),
    nodeRepresentationMap: Object.freeze(nodeRepresentationMap),
  });
}
