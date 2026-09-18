import type { CodebaseGraph } from "@/entities";
import {
  toReactFlowElements,
  type CodebaseReactFlowNode,
  type CodebaseReactFlowEdge,
} from "../adapters/react-flow-adapter";
import { computeDagreLayout, type DagreLayoutOptions } from "./dagre-layout";
export type { DagreLayoutOptions };
import type { GraphFilterState } from "@/stores/graph-store";
import type { LayoutWorkerSuccessPayload } from "@/lib/workers/worker-types";

export const DEFAULT_LAYOUT_OPTIONS: DagreLayoutOptions = Object.freeze({
  direction: "LR",
  nodeWidth: 240,
  nodeHeight: 80,
  nodeSeparation: 50,
  rankSeparation: 100,
  groupByFolder: true,
});

/**
 * Pure layout execution function that runs filtering, React Flow element adaptation,
 * Dagre hierarchical coordinate calculation, and edge styling without any DOM coupling.
 *
 * This function is shared between the dedicated Web Worker and the main-thread
 * synchronous fallback, guaranteeing identical layout coordinates and visual parity.
 */
export function executeLayoutComputation(
  graph: CodebaseGraph | null | undefined,
  filters: GraphFilterState,
  options: DagreLayoutOptions = DEFAULT_LAYOUT_OPTIONS,
): LayoutWorkerSuccessPayload {
  const startTime = performance.now();

  if (!graph || Object.keys(graph.files).length === 0) {
    return Object.freeze({
      nodes: Object.freeze([]),
      edges: Object.freeze([]),
      durationMs: Math.round(performance.now() - startTime),
    });
  }

  const rawElements = toReactFlowElements(graph, {
    scope: {
      granularity: "files",
      includeExternal: !filters.hideExternal,
    },
    enabledEdgeKinds: ["file_import", "re_export", "call", "type_reference"],
    filters: {
      selectedLayers: filters.selectedLayers,
      collapsedFolderIds: filters.collapsedFolderIds,
      searchQuery: filters.searchQuery,
      hideExternal: filters.hideExternal,
    },
  });

  const positioned = computeDagreLayout(rawElements, options);

  const styledEdges: CodebaseReactFlowEdge[] = positioned.edges.map((edge) => ({
    ...edge,
    type: "smoothstep",
    style: {
      stroke: "#475569",
      strokeWidth: 1.5,
      strokeOpacity: 0.6,
    },
    markerEnd: {
      type: "arrowclosed",
      color: "rgba(100, 116, 139, 0.6)",
      width: 12,
      height: 12,
    },
  }));

  const durationMs = Math.round(performance.now() - startTime);

  return Object.freeze({
    nodes: Object.freeze(positioned.nodes as CodebaseReactFlowNode[]),
    edges: Object.freeze(styledEdges),
    durationMs,
  });
}
