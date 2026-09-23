import type { CodebaseGraph } from "@/entities";
import {
  ARCHITECTURAL_LAYERS,
  type ArchitecturalLayerId,
  classifyLayerForPath,
  getLayerDefinition,
} from "./layers";

/**
 * Immutable topological metrics and architectural layer distributions computed from a CodebaseGraph.
 */
export interface HeuristicIndex {
  readonly fanIn: Readonly<Record<string, number>>;
  readonly fanOut: Readonly<Record<string, number>>;
  readonly layerByFile: Readonly<Record<string, ArchitecturalLayerId>>;
  readonly filesByLayer: Readonly<
    Record<ArchitecturalLayerId, readonly string[]>
  >;
  readonly layerMatrix: Readonly<
    Record<ArchitecturalLayerId, Readonly<Record<ArchitecturalLayerId, number>>>
  >;
  readonly invertedEdges: readonly {
    readonly sourceId: string;
    readonly targetId: string;
  }[];
  readonly fileCount: number;
  readonly internalEdgeCount: number;
}

const INVERTED_SOURCE_LAYERS = new Set<ArchitecturalLayerId>([
  "entities",
  "lib",
  "utils",
  "api",
]);

const INVERTED_TARGET_LAYERS = new Set<ArchitecturalLayerId>([
  "components",
  "hooks",
  "stores",
  "app",
]);

const indexCache = new WeakMap<CodebaseGraph, HeuristicIndex>();

/**
 * Compares two strings using raw Unicode codepoint order.
 */
function compareCodepoints(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Pure, single-pass O(files + edges) construction of the HeuristicIndex.
 */
export function buildHeuristicIndex(graph: CodebaseGraph): HeuristicIndex {
  const fileEntries = Object.values(graph.files ?? {});
  const fileCount = fileEntries.length;

  const fanIn: Record<string, number> = {};
  const fanOut: Record<string, number> = {};
  const layerByFile: Record<string, ArchitecturalLayerId> = {};
  const filesByLayerMutable: Record<ArchitecturalLayerId, string[]> = {
    components: [],
    hooks: [],
    stores: [],
    entities: [],
    lib: [],
    api: [],
    utils: [],
    app: [],
    other: [],
  };

  for (const file of fileEntries) {
    fanIn[file.id] = 0;
    fanOut[file.id] = 0;
    const layer = classifyLayerForPath(file.path);
    layerByFile[file.id] = layer;
    filesByLayerMutable[layer].push(file.id);
  }

  // Freeze filesByLayer arrays
  const filesByLayer: Record<ArchitecturalLayerId, readonly string[]> = {
    components: Object.freeze(filesByLayerMutable.components),
    hooks: Object.freeze(filesByLayerMutable.hooks),
    stores: Object.freeze(filesByLayerMutable.stores),
    entities: Object.freeze(filesByLayerMutable.entities),
    lib: Object.freeze(filesByLayerMutable.lib),
    api: Object.freeze(filesByLayerMutable.api),
    utils: Object.freeze(filesByLayerMutable.utils),
    app: Object.freeze(filesByLayerMutable.app),
    other: Object.freeze(filesByLayerMutable.other),
  };

  // Initialize square layer matrix with zeros
  const layerMatrixMutable: Record<
    ArchitecturalLayerId,
    Record<ArchitecturalLayerId, number>
  > = {
    components: {} as Record<ArchitecturalLayerId, number>,
    hooks: {} as Record<ArchitecturalLayerId, number>,
    stores: {} as Record<ArchitecturalLayerId, number>,
    entities: {} as Record<ArchitecturalLayerId, number>,
    lib: {} as Record<ArchitecturalLayerId, number>,
    api: {} as Record<ArchitecturalLayerId, number>,
    utils: {} as Record<ArchitecturalLayerId, number>,
    app: {} as Record<ArchitecturalLayerId, number>,
    other: {} as Record<ArchitecturalLayerId, number>,
  };

  for (const sourceLayer of ARCHITECTURAL_LAYERS) {
    for (const targetLayer of ARCHITECTURAL_LAYERS) {
      layerMatrixMutable[sourceLayer.id][targetLayer.id] = 0;
    }
  }

  const seenEdgePairs = new Set<string>();
  const rawInvertedEdges: {
    sourceId: string;
    targetId: string;
    sourceRank: number;
    sourcePath: string;
  }[] = [];

  let internalEdgeCount = 0;

  for (const edge of Object.values(graph.edges ?? {})) {
    if (edge.isExternal) continue;
    if (edge.kind !== "file_import" && edge.kind !== "re_export") continue;

    const sourceFile = graph.files[edge.sourceId];
    const targetFile = graph.files[edge.targetId];
    if (!sourceFile || !targetFile) continue;

    const pairKey = `${edge.sourceId}-->${edge.targetId}`;
    if (seenEdgePairs.has(pairKey)) continue;
    seenEdgePairs.add(pairKey);

    internalEdgeCount += 1;
    fanOut[edge.sourceId] = (fanOut[edge.sourceId] ?? 0) + 1;
    fanIn[edge.targetId] = (fanIn[edge.targetId] ?? 0) + 1;

    const srcLayer = layerByFile[edge.sourceId] ?? "other";
    const tgtLayer = layerByFile[edge.targetId] ?? "other";
    layerMatrixMutable[srcLayer][tgtLayer] += 1;

    if (
      INVERTED_SOURCE_LAYERS.has(srcLayer) &&
      INVERTED_TARGET_LAYERS.has(tgtLayer)
    ) {
      const srcRank = getLayerDefinition(srcLayer).rank;
      rawInvertedEdges.push({
        sourceId: edge.sourceId,
        targetId: edge.targetId,
        sourceRank: srcRank,
        sourcePath: sourceFile.path,
      });
    }
  }

  // Sort inverted edges: source layer rank asc, then source path asc (raw codepoint comparison)
  rawInvertedEdges.sort((a, b) => {
    if (a.sourceRank !== b.sourceRank) {
      return a.sourceRank - b.sourceRank;
    }
    return compareCodepoints(a.sourcePath, b.sourcePath);
  });

  const invertedEdges = Object.freeze(
    rawInvertedEdges.slice(0, 5).map((e) =>
      Object.freeze({
        sourceId: e.sourceId,
        targetId: e.targetId,
      }),
    ),
  );

  const frozenLayerMatrix: Record<
    ArchitecturalLayerId,
    Readonly<Record<ArchitecturalLayerId, number>>
  > = {} as Record<
    ArchitecturalLayerId,
    Readonly<Record<ArchitecturalLayerId, number>>
  >;
  for (const layer of ARCHITECTURAL_LAYERS) {
    frozenLayerMatrix[layer.id] = Object.freeze(layerMatrixMutable[layer.id]);
  }

  const result: HeuristicIndex = Object.freeze({
    fanIn: Object.freeze(fanIn),
    fanOut: Object.freeze(fanOut),
    layerByFile: Object.freeze(layerByFile),
    filesByLayer: Object.freeze(filesByLayer),
    layerMatrix: Object.freeze(frozenLayerMatrix),
    invertedEdges,
    fileCount,
    internalEdgeCount,
  });

  return result;
}

/**
 * Returns the cached HeuristicIndex for a graph, building it once on demand.
 */
export function getHeuristicIndex(graph: CodebaseGraph): HeuristicIndex {
  let index = indexCache.get(graph);
  if (!index) {
    index = buildHeuristicIndex(graph);
    indexCache.set(graph, index);
  }
  return index;
}
