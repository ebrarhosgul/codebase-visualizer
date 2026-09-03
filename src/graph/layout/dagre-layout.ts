import dagre from "@dagrejs/dagre";
import type {
  ReactFlowElements,
  CodebaseReactFlowNode,
  CodebaseReactFlowEdge,
} from "../adapters/react-flow-adapter";

export const DEFAULT_NODE_WIDTH = 220 as const;
export const DEFAULT_NODE_HEIGHT = 72 as const;
export const DEFAULT_NODE_SEPARATION = 60 as const;
export const DEFAULT_RANK_SEPARATION = 80 as const;

export interface DagreLayoutOptions {
  readonly direction?: "TB" | "BT" | "LR" | "RL";
  readonly nodeWidth?: number;
  readonly nodeHeight?: number;
  readonly nodeSeparation?: number;
  readonly rankSeparation?: number;
}

/**
 * Pure layout function that computes non-overlapping hierarchical coordinates
 * for React Flow nodes and edges using Dagre layering based on dependency flow.
 *
 * Card dimensions default to 220px by 72px.
 * Dagre coordinates (center based) are shifted to top left for React Flow compatibility.
 */
export function computeDagreLayout(
  elements: ReactFlowElements,
  options: DagreLayoutOptions = {},
): ReactFlowElements {
  const direction = options.direction ?? "TB";
  const nodeWidth = options.nodeWidth ?? DEFAULT_NODE_WIDTH;
  const nodeHeight = options.nodeHeight ?? DEFAULT_NODE_HEIGHT;
  const nodeSeparation = options.nodeSeparation ?? DEFAULT_NODE_SEPARATION;
  const rankSeparation = options.rankSeparation ?? DEFAULT_RANK_SEPARATION;

  if (elements.nodes.length === 0) {
    return elements;
  }

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: direction,
    nodesep: nodeSeparation,
    ranksep: rankSeparation,
    marginx: 30,
    marginy: 30,
  });

  // Register nodes with fixed card dimensions
  for (const node of elements.nodes) {
    g.setNode(node.id, {
      width: nodeWidth,
      height: nodeHeight,
    });
  }

  // Register edges
  for (const edge of elements.edges) {
    // Only register edges if both endpoints exist in the graph
    if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
      g.setEdge(edge.source, edge.target);
    }
  }

  // Execute Dagre layout algorithm
  dagre.layout(g);

  // Position nodes to top-left coordinate origin
  const positionedNodes: CodebaseReactFlowNode[] = elements.nodes.map(
    (node) => {
      const layoutNode = g.node(node.id);
      if (!layoutNode) {
        return node;
      }

      const x = Math.round(layoutNode.x - nodeWidth / 2);
      const y = Math.round(layoutNode.y - nodeHeight / 2);

      return {
        ...node,
        position: { x, y },
      };
    },
  );

  return {
    nodes: Object.freeze(positionedNodes),
    edges: Object.freeze([...elements.edges] as CodebaseReactFlowEdge[]),
  };
}
