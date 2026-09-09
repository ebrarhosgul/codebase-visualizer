import dagre from "@dagrejs/dagre";
import type {
  ReactFlowElements,
  CodebaseReactFlowNode,
  CodebaseReactFlowEdge,
} from "../adapters/react-flow-adapter";

export const DEFAULT_NODE_WIDTH = 240 as const;
export const DEFAULT_NODE_HEIGHT = 80 as const;
export const DEFAULT_NODE_SEPARATION = 60 as const;
export const DEFAULT_RANK_SEPARATION = 80 as const;

export interface DagreLayoutOptions {
  readonly direction?: "TB" | "BT" | "LR" | "RL";
  readonly nodeWidth?: number;
  readonly nodeHeight?: number;
  readonly nodeSeparation?: number;
  readonly rankSeparation?: number;
  readonly groupByFolder?: boolean;
}

/**
 * Extracts folder identifier and label for a node to enable compound clustering.
 */
function getFolderForNode(
  node: CodebaseReactFlowNode,
): { key: string; label: string; isCollapsed?: boolean } | null {
  if (node.type === "folderGroup" || node.type === "directory") {
    return null;
  }
  if (node.type === "collapsedFolder") {
    return {
      key: node.id,
      label: (node.data?.label as string) || node.id,
      isCollapsed: true,
    };
  }
  const entityData = node.data;
  if (!entityData) return null;

  if (entityData.entityType === "file") {
    const file = entityData.entity;
    const path = file.path || node.id.replace(/^file:/, "");
    const parts = path.split("/");
    const folder = parts.length > 1 ? parts.slice(0, -1).join("/") : "(root)";
    return {
      key: `folder-group:${folder}`,
      label: folder === "(root)" ? "root files" : folder,
    };
  }

  if (entityData.entityType === "external") {
    return {
      key: "folder-group:external",
      label: "External Packages",
    };
  }

  return null;
}

/**
 * Pure layout function that computes non-overlapping hierarchical coordinates
 * for React Flow nodes and edges using Dagre layering based on dependency flow.
 *
 * Supports optional compound folder clustering to group files by directory.
 * Card dimensions default to 220px by 72px.
 * Dagre coordinates (center based) are shifted to top left for React Flow compatibility.
 */
/**
 * Pure layout function that computes non-overlapping hierarchical coordinates
 * for React Flow nodes and edges using Dagre layering based on dependency flow.
 *
 * When groupByFolder is true, uses a two-level hierarchical layout:
 * 1. Groups files into directory clusters and determines each cluster's internal card grid and dimensions.
 * 2. Connects clusters via inter-folder edges derived from file dependencies.
 * 3. Lays out folder macro-nodes in Dagre, guaranteeing zero overlap between directory containers.
 * 4. Places child file cards at deterministic offsets inside their folder's assigned bounds.
 *
 * When groupByFolder is false, executes standard flat Dagre layout on individual nodes.
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
  const groupByFolder = options.groupByFolder ?? false;

  // Filter out any prior folderGroup nodes from input
  const fileNodes = elements.nodes.filter((n) => n.type !== "folderGroup");

  if (fileNodes.length === 0) {
    return {
      nodes: Object.freeze([]),
      edges: Object.freeze([...elements.edges] as CodebaseReactFlowEdge[]),
    };
  }

  // --- MODE 1: Hierarchical Two-Level Folder Cluster Layout ---
  if (groupByFolder) {
    interface ClusterInfo {
      key: string;
      label: string;
      isCollapsed: boolean;
      collapsedNode?: CodebaseReactFlowNode;
      nodes: CodebaseReactFlowNode[];
      cols: number;
      rows: number;
      width: number;
      height: number;
    }

    const padX = 24;
    const padTop = 50;
    const padBottom = 24;
    const gapX = 20;
    const gapY = 16;

    // Partition files into folder clusters
    const clusterMap = new Map<
      string,
      {
        key: string;
        label: string;
        isCollapsed: boolean;
        collapsedNode?: CodebaseReactFlowNode;
        nodes: CodebaseReactFlowNode[];
      }
    >();
    const nodeToFolder = new Map<string, string>();

    for (const node of fileNodes) {
      if (node.type === "collapsedFolder") {
        nodeToFolder.set(node.id, node.id);
        clusterMap.set(node.id, {
          key: node.id,
          label: (node.data?.label as string) || node.id,
          isCollapsed: true,
          collapsedNode: node,
          nodes: [],
        });
        continue;
      }

      const folderInfo = getFolderForNode(node) ?? {
        key: "folder-group:other",
        label: "Other",
      };
      nodeToFolder.set(node.id, folderInfo.key);

      let cluster = clusterMap.get(folderInfo.key);
      if (!cluster) {
        cluster = {
          key: folderInfo.key,
          label: folderInfo.label,
          isCollapsed: false,
          nodes: [],
        };
        clusterMap.set(folderInfo.key, cluster);
      }
      cluster.nodes.push(node);
    }

    // Compute dimensions and internal grid for each cluster
    const clusters: ClusterInfo[] = Array.from(clusterMap.values()).map((c) => {
      if (c.isCollapsed) {
        return {
          key: c.key,
          label: c.label,
          isCollapsed: true,
          collapsedNode: c.collapsedNode,
          nodes: [],
          cols: 1,
          rows: 1,
          width: 260,
          height: 90,
        };
      }

      // Sort files alphabetically for predictable, neat placement
      c.nodes.sort((a, b) => {
        const nameA = a.data?.label || a.id;
        const nameB = b.data?.label || b.id;
        return nameA.localeCompare(nameB);
      });

      const count = c.nodes.length;
      const cols = count <= 3 ? 1 : count <= 8 ? 2 : 3;
      const rows = Math.ceil(count / cols);
      const width = padX * 2 + cols * nodeWidth + (cols - 1) * gapX;
      const height = padTop + padBottom + rows * nodeHeight + (rows - 1) * gapY;

      return {
        key: c.key,
        label: c.label,
        isCollapsed: false,
        nodes: c.nodes,
        cols,
        rows,
        width,
        height,
      };
    });

    // Build inter-folder Dagre graph
    const fg = new dagre.graphlib.Graph();
    fg.setDefaultEdgeLabel(() => ({}));
    fg.setGraph({
      rankdir: direction,
      nodesep: nodeSeparation,
      ranksep: rankSeparation,
      marginx: 40,
      marginy: 40,
    });

    for (const cluster of clusters) {
      fg.setNode(cluster.key, {
        width: cluster.width,
        height: cluster.height,
      });
    }

    for (const edge of elements.edges) {
      const sourceFolder = nodeToFolder.get(edge.source);
      const targetFolder = nodeToFolder.get(edge.target);
      if (sourceFolder && targetFolder && sourceFolder !== targetFolder) {
        if (!fg.hasEdge(sourceFolder, targetFolder)) {
          fg.setEdge(sourceFolder, targetFolder);
        }
      }
    }

    // Layout folder macro-nodes
    dagre.layout(fg);

    const folderGroupNodes: CodebaseReactFlowNode[] = [];
    const positionedNodes: CodebaseReactFlowNode[] = [];

    for (const cluster of clusters) {
      const layoutFolder = fg.node(cluster.key);
      const fx = layoutFolder
        ? Math.round(layoutFolder.x - cluster.width / 2)
        : 0;
      const fy = layoutFolder
        ? Math.round(layoutFolder.y - cluster.height / 2)
        : 0;

      if (cluster.isCollapsed && cluster.collapsedNode) {
        positionedNodes.push({
          ...cluster.collapsedNode,
          position: { x: fx, y: fy },
          zIndex: 1,
        });
        continue;
      }

      folderGroupNodes.push({
        id: cluster.key,
        type: "folderGroup",
        position: { x: fx, y: fy },
        style: {
          width: cluster.width,
          height: cluster.height,
          zIndex: -1,
        },
        data: {
          entityType: "directory",
          entity: {
            id: cluster.key,
            path: cluster.label,
            name: cluster.label,
            parentDirId: null,
            childDirIds: Object.freeze([]),
            childFileIds: Object.freeze(cluster.nodes.map((n) => n.id)),
          },
          label: cluster.label,
          fileCount: cluster.nodes.length,
          hasActiveChild: false,
          isHighlighted: false,
        } as unknown as CodebaseReactFlowNode["data"],
        selectable: false,
        draggable: false,
      });

      // Position child nodes inside folder container
      cluster.nodes.forEach((node, idx) => {
        const col = idx % cluster.cols;
        const row = Math.floor(idx / cluster.cols);
        const nx = fx + padX + col * (nodeWidth + gapX);
        const ny = fy + padTop + row * (nodeHeight + gapY);

        positionedNodes.push({
          ...node,
          position: { x: nx, y: ny },
          zIndex: 1,
        });
      });
    }

    return {
      nodes: Object.freeze([...folderGroupNodes, ...positionedNodes]),
      edges: Object.freeze([...elements.edges] as CodebaseReactFlowEdge[]),
    };
  }

  // --- MODE 2: Flat Dagre Layout (groupByFolder is false) ---
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
  for (const node of fileNodes) {
    const w = node.type === "collapsedFolder" ? 260 : nodeWidth;
    const h = node.type === "collapsedFolder" ? 90 : nodeHeight;
    g.setNode(node.id, {
      width: w,
      height: h,
    });
  }

  // Register edges
  for (const edge of elements.edges) {
    if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
      g.setEdge(edge.source, edge.target);
    }
  }

  // Execute Dagre layout algorithm
  dagre.layout(g);

  // Position nodes to top-left coordinate origin
  const positionedNodes: CodebaseReactFlowNode[] = fileNodes.map((node) => {
    const layoutNode = g.node(node.id);
    if (!layoutNode) {
      return node;
    }

    const w = node.type === "collapsedFolder" ? 260 : nodeWidth;
    const h = node.type === "collapsedFolder" ? 90 : nodeHeight;

    const x = Math.round(layoutNode.x - w / 2);
    const y = Math.round(layoutNode.y - h / 2);

    return {
      ...node,
      position: { x, y },
      zIndex: 1,
    };
  });

  return {
    nodes: Object.freeze(positionedNodes),
    edges: Object.freeze([...elements.edges] as CodebaseReactFlowEdge[]),
  };
}
