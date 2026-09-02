import type {
  CodebaseGraph,
  DirectoryNode,
  FileNode,
  SymbolNode,
  ExternalModuleNode,
  GraphEdge,
  EdgeKind,
} from "../entities";

export interface GraphScope {
  readonly granularity: "directories" | "files" | "symbols" | "all";
  readonly rootDirectoryPath?: string;
  readonly includeExternal: boolean;
  readonly depthLimit?: number;
}

export interface FilterOptions {
  readonly scope: GraphScope;
  readonly selectedNodeIds?: readonly string[];
  readonly enabledEdgeKinds?: readonly EdgeKind[];
  readonly searchQuery?: string;
}

export interface AdjacencyIndex {
  readonly outgoing: Readonly<Record<string, readonly GraphEdge[]>>;
  readonly incoming: Readonly<Record<string, readonly GraphEdge[]>>;
}

/**
 * Builds an immutable adjacency lookup index for fast edge traversal in both directions.
 */
export function buildAdjacencyIndex(
  edges: Readonly<Record<string, GraphEdge>>,
): AdjacencyIndex {
  const outgoingMap: Record<string, GraphEdge[]> = {};
  const incomingMap: Record<string, GraphEdge[]> = {};

  for (const edge of Object.values(edges)) {
    if (!outgoingMap[edge.sourceId]) {
      outgoingMap[edge.sourceId] = [];
    }
    outgoingMap[edge.sourceId].push(edge);

    if (!incomingMap[edge.targetId]) {
      incomingMap[edge.targetId] = [];
    }
    incomingMap[edge.targetId].push(edge);
  }

  return {
    outgoing: Object.freeze(outgoingMap),
    incoming: Object.freeze(incomingMap),
  };
}

export interface TraversalOptions {
  readonly startNodeId: string;
  readonly direction?: "outgoing" | "incoming" | "both";
  readonly maxDepth?: number;
  readonly edgeFilter?: (edge: GraphEdge) => boolean;
}

/**
 * Traverses a directed graph safely using a visited set to prevent infinite loops in cyclic graphs.
 * Returns an ordered array of visited node identifiers.
 */
export function traverseGraph(
  graph: CodebaseGraph,
  options: TraversalOptions,
): readonly string[] {
  const {
    startNodeId,
    direction = "outgoing",
    maxDepth = Number.POSITIVE_INFINITY,
    edgeFilter,
  } = options;

  const adjacency = buildAdjacencyIndex(graph.edges);
  const visited = new Set<string>();
  const order: string[] = [];

  const queue: Array<{ readonly nodeId: string; readonly depth: number }> = [
    { nodeId: startNodeId, depth: 0 },
  ];
  visited.add(startNodeId);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;

    order.push(current.nodeId);

    if (current.depth >= maxDepth) {
      continue;
    }

    const candidateEdges: GraphEdge[] = [];

    if (direction === "outgoing" || direction === "both") {
      const outEdges = adjacency.outgoing[current.nodeId] ?? [];
      candidateEdges.push(...outEdges);
    }

    if (direction === "incoming" || direction === "both") {
      const inEdges = adjacency.incoming[current.nodeId] ?? [];
      candidateEdges.push(...inEdges);
    }

    for (const edge of candidateEdges) {
      if (edgeFilter && !edgeFilter(edge)) {
        continue;
      }

      // Next node depends on whether this edge is outgoing or incoming relative to current
      const nextNodeId =
        edge.sourceId === current.nodeId ? edge.targetId : edge.sourceId;

      if (!visited.has(nextNodeId)) {
        visited.add(nextNodeId);
        queue.push({ nodeId: nextNodeId, depth: current.depth + 1 });
      }
    }
  }

  return Object.freeze(order);
}

/**
 * Filters a CodebaseGraph according to granularity, root path, external inclusion, and depth limit.
 * Guaranteed to return an immutable graph containing only valid surviving nodes and connected edges.
 */
export function filterGraphByScope(
  graph: CodebaseGraph,
  scope: GraphScope,
): CodebaseGraph {
  const rootPath = scope.rootDirectoryPath
    ? scope.rootDirectoryPath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "")
    : null;

  // Filter directories
  const filteredDirectories: Record<string, DirectoryNode> = {};
  for (const [id, dir] of Object.entries(graph.directories)) {
    if (rootPath) {
      const matchesRoot =
        dir.path === rootPath ||
        dir.path.startsWith(`${rootPath}/`) ||
        rootPath.startsWith(`${dir.path}/`);
      if (!matchesRoot) continue;
    }

    if (scope.depthLimit !== undefined && scope.depthLimit >= 0) {
      const segments = dir.path === "" ? 0 : dir.path.split("/").length;
      if (segments > scope.depthLimit) continue;
    }

    filteredDirectories[id] = dir;
  }

  // Filter files
  const filteredFiles: Record<string, FileNode> = {};
  if (scope.granularity !== "directories") {
    for (const [id, file] of Object.entries(graph.files)) {
      if (rootPath && !file.path.startsWith(`${rootPath}/`)) {
        continue;
      }

      // If directory is filtered out, skip file
      if (
        Object.keys(filteredDirectories).length > 0 &&
        !filteredDirectories[file.directoryId]
      ) {
        continue;
      }

      filteredFiles[id] = file;
    }
  }

  // Filter symbols
  const filteredSymbols: Record<string, SymbolNode> = {};
  if (scope.granularity === "symbols" || scope.granularity === "all") {
    for (const [id, symbol] of Object.entries(graph.symbols)) {
      // Only keep symbols whose declaring file is present
      if (filteredFiles[symbol.fileId]) {
        filteredSymbols[id] = symbol;
      }
    }
  }

  // Filter external modules
  const filteredExternal: Record<string, ExternalModuleNode> = {};
  if (scope.includeExternal) {
    Object.assign(filteredExternal, graph.externalModules);
  }

  // Active node IDs set for fast edge validation
  const validNodeIds = new Set<string>([
    ...Object.keys(filteredDirectories),
    ...Object.keys(filteredFiles),
    ...Object.keys(filteredSymbols),
    ...Object.keys(filteredExternal),
  ]);

  // Filter edges: both endpoints must survive
  const filteredEdges: Record<string, GraphEdge> = {};
  for (const [id, edge] of Object.entries(graph.edges)) {
    if (validNodeIds.has(edge.sourceId) && validNodeIds.has(edge.targetId)) {
      filteredEdges[id] = edge;
    }
  }

  return {
    schemaVersion: graph.schemaVersion,
    repository: graph.repository,
    directories: Object.freeze(filteredDirectories),
    files: Object.freeze(filteredFiles),
    symbols: Object.freeze(filteredSymbols),
    externalModules: Object.freeze(filteredExternal),
    edges: Object.freeze(filteredEdges),
  };
}
