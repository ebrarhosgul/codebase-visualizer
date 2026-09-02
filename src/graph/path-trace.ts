import type { CodebaseGraph, PathTrace, GraphEdge } from "../entities";
import { createPathTraceId, pathTraceSchema } from "../entities";
import { buildAdjacencyIndex } from "./traversal";

/**
 * Finds the shortest directed dependency path between two nodes in a CodebaseGraph.
 * Uses breadth first search with a cycle safe visited set.
 * Returns null if no path exists or if either endpoint is missing.
 */
export function findDependencyPath(
  graph: CodebaseGraph,
  sourceId: string,
  targetId: string,
): PathTrace | null {
  if (sourceId === targetId) {
    return {
      id: createPathTraceId(sourceId, targetId),
      sourceNodeId: sourceId,
      targetNodeId: targetId,
      stepNodeIds: [sourceId],
      stepEdgeIds: [],
      hopCount: 0,
      rationale: `Source and target are identical node ${sourceId}`,
      createdAt: new Date().toISOString(),
    };
  }

  const allNodeIds = new Set<string>([
    ...Object.keys(graph.directories),
    ...Object.keys(graph.files),
    ...Object.keys(graph.symbols),
    ...Object.keys(graph.externalModules),
  ]);

  if (!allNodeIds.has(sourceId) || !allNodeIds.has(targetId)) {
    return null;
  }

  const adjacency = buildAdjacencyIndex(graph.edges);
  const visited = new Set<string>([sourceId]);

  // Queue holds path of nodes and path of edges
  interface QueueItem {
    readonly currentNodeId: string;
    readonly nodePath: readonly string[];
    readonly edgePath: readonly GraphEdge[];
  }

  const queue: QueueItem[] = [
    {
      currentNodeId: sourceId,
      nodePath: [sourceId],
      edgePath: [],
    },
  ];

  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) break;

    const outgoingEdges = adjacency.outgoing[item.currentNodeId] ?? [];

    for (const edge of outgoingEdges) {
      const neighborId = edge.targetId;

      if (neighborId === targetId) {
        const fullNodePath = [...item.nodePath, neighborId];
        const fullEdgePath = [...item.edgePath, edge];
        const stepEdgeIds = fullEdgePath.map((e) => e.id);

        const trace: PathTrace = {
          id: createPathTraceId(sourceId, targetId),
          sourceNodeId: sourceId,
          targetNodeId: targetId,
          stepNodeIds: Object.freeze(fullNodePath),
          stepEdgeIds: Object.freeze(stepEdgeIds),
          hopCount: fullEdgePath.length,
          rationale: `Path from ${sourceId} to ${targetId} via ${fullEdgePath.length} hop${
            fullEdgePath.length === 1 ? "" : "s"
          }`,
          createdAt: new Date().toISOString(),
        };

        return pathTraceSchema.parse(trace) as PathTrace;
      }

      if (!visited.has(neighborId)) {
        visited.add(neighborId);
        queue.push({
          currentNodeId: neighborId,
          nodePath: [...item.nodePath, neighborId],
          edgePath: [...item.edgePath, edge],
        });
      }
    }
  }

  return null;
}
