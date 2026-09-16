import type { Node, Edge } from "@xyflow/react";
import type {
  CodebaseGraph,
  DirectoryNode,
  FileNode,
  SymbolNode,
  ExternalModuleNode,
  GraphEdge,
  EdgeKind,
} from "../../entities";
import { filterGraphByScope, type FilterOptions } from "../traversal";
import {
  type CollapsedFolderSummary,
  filterAndAggregateGraph,
} from "../filtering";
import type { ArchitecturalLayerId } from "../layers";
import type { GraphFilterState } from "@/stores/graph-store";

/**
 * Metadata carried in React Flow node data payload for each entity type.
 */
export type ReactFlowEntityNodeData = (
  | {
      readonly entityType: "directory";
      readonly entity: DirectoryNode;
      readonly label: string;
    }
  | {
      readonly entityType: "file";
      readonly entity: FileNode;
      readonly label: string;
    }
  | {
      readonly entityType: "symbol";
      readonly entity: SymbolNode;
      readonly label: string;
    }
  | {
      readonly entityType: "external";
      readonly entity: ExternalModuleNode;
      readonly label: string;
    }
  | {
      readonly entityType: "collapsedFolder";
      readonly entity: CollapsedFolderSummary;
      readonly label: string;
      readonly fileCount: number;
      readonly dominantLayerId: ArchitecturalLayerId;
      readonly externalImportCount: number;
      readonly externalExportCount: number;
    }
) &
  Record<string, unknown>;

/**
 * Metadata carried in React Flow edge data payload.
 */
export type ReactFlowEdgeData = {
  readonly kind: EdgeKind;
  readonly weight: number;
  readonly isExternal: boolean;
  readonly metadata?: GraphEdge["metadata"];
  readonly isBundled?: boolean;
  readonly [key: string]: unknown;
};

export type CodebaseReactFlowNode = Node<ReactFlowEntityNodeData>;
export type CodebaseReactFlowEdge = Edge<ReactFlowEdgeData>;

export interface ReactFlowElements {
  readonly nodes: readonly CodebaseReactFlowNode[];
  readonly edges: readonly CodebaseReactFlowEdge[];
}

export interface ReactFlowAdapterOptions extends Partial<FilterOptions> {
  readonly filters?: GraphFilterState;
}

/**
 * Pure transformation adapter that projects canonical CodebaseGraph domain entities into
 * React Flow nodes and edges without mutating or polluting the underlying model.
 */
export function toReactFlowElements(
  graph: CodebaseGraph,
  options: ReactFlowAdapterOptions,
): ReactFlowElements {
  if (options.filters) {
    const filtered = filterAndAggregateGraph(graph, options.filters);
    const nodes: CodebaseReactFlowNode[] = [];

    // Visible files
    for (const file of filtered.visibleFiles) {
      nodes.push({
        id: file.id,
        type: "file",
        position: { x: 0, y: 0 },
        data: {
          entityType: "file",
          entity: file,
          label: file.name,
        },
      });
    }

    // Collapsed folders as summary cards
    for (const folder of filtered.collapsedFolders) {
      nodes.push({
        id: folder.directoryId,
        type: "collapsedFolder",
        position: { x: 0, y: 0 },
        data: {
          entityType: "collapsedFolder",
          entity: folder,
          label: folder.path,
          fileCount: folder.fileCount,
          dominantLayerId: folder.dominantLayerId,
          externalImportCount: folder.externalImportCount,
          externalExportCount: folder.externalExportCount,
        },
      });
    }

    // Visible external modules
    for (const ext of filtered.visibleExternalModules) {
      nodes.push({
        id: ext.id,
        type: "external",
        position: { x: 0, y: 0 },
        data: {
          entityType: "external",
          entity: ext,
          label: ext.name,
        },
      });
    }

    // Visible symbols under visible files (with initial hidden: true for progressive disclosure)
    const visibleFileIds = new Set(filtered.visibleFiles.map((f) => f.id));
    const searchFilter = options.filters.searchQuery?.trim().toLowerCase();
    for (const sym of Object.values(graph.symbols)) {
      if (!visibleFileIds.has(sym.fileId)) {
        continue;
      }
      if (searchFilter && !sym.name.toLowerCase().includes(searchFilter)) {
        continue;
      }
      nodes.push({
        id: sym.id,
        type: "symbol",
        position: { x: 0, y: 0 },
        hidden: true,
        data: {
          entityType: "symbol",
          entity: sym,
          label: sym.name,
        },
      });
    }

    let allowedEdgeKinds: Set<EdgeKind> | null = null;
    if (options.enabledEdgeKinds && options.enabledEdgeKinds.length > 0) {
      allowedEdgeKinds = new Set(options.enabledEdgeKinds);
    }

    const activeNodeIds = new Set(nodes.map((n) => n.id));
    const edges: CodebaseReactFlowEdge[] = [];
    const seenEdges = new Set<string>();

    // Direct visible edges
    for (const edge of filtered.visibleEdges) {
      if (allowedEdgeKinds && !allowedEdgeKinds.has(edge.kind)) {
        continue;
      }

      const sourceId =
        filtered.nodeRepresentationMap[edge.sourceId] ?? edge.sourceId;
      const targetId =
        filtered.nodeRepresentationMap[edge.targetId] ?? edge.targetId;

      if (!activeNodeIds.has(sourceId) || !activeNodeIds.has(targetId)) {
        continue;
      }

      const visualEdgeKey = `${sourceId}->${targetId}:${edge.kind}`;
      if (seenEdges.has(visualEdgeKey)) {
        continue;
      }
      seenEdges.add(visualEdgeKey);

      edges.push({
        id: edge.id,
        source: sourceId,
        target: targetId,
        type: edge.kind,
        ...(edge.weight > 1 ? { label: `x${edge.weight}` } : {}),
        data: {
          kind: edge.kind,
          weight: edge.weight,
          isExternal: edge.isExternal,
          ...(edge.metadata ? { metadata: edge.metadata } : {}),
        },
      });
    }

    // Bundled summary edges
    for (const edge of filtered.bundledEdges) {
      if (allowedEdgeKinds && !allowedEdgeKinds.has(edge.kind)) {
        continue;
      }

      if (
        !activeNodeIds.has(edge.sourceId) ||
        !activeNodeIds.has(edge.targetId)
      ) {
        continue;
      }

      edges.push({
        id: edge.id,
        source: edge.sourceId,
        target: edge.targetId,
        type: edge.kind,
        label: edge.weight > 1 ? `${edge.weight} links` : "1 link",
        data: {
          kind: edge.kind,
          weight: edge.weight,
          isExternal: edge.isExternal,
          isBundled: true,
        },
      });
    }

    return {
      nodes: Object.freeze(nodes),
      edges: Object.freeze(edges),
    };
  }

  const scopedGraph = filterGraphByScope(
    graph,
    options.scope ?? { granularity: "files", includeExternal: true },
  );

  let allowedEdgeKinds: Set<EdgeKind> | null = null;
  if (options.enabledEdgeKinds && options.enabledEdgeKinds.length > 0) {
    allowedEdgeKinds = new Set(options.enabledEdgeKinds);
  }

  const query = options.searchQuery?.trim().toLowerCase();

  const nodes: CodebaseReactFlowNode[] = [];

  // Project directories
  for (const dir of Object.values(scopedGraph.directories)) {
    if (
      query &&
      !dir.name.toLowerCase().includes(query) &&
      !dir.path.toLowerCase().includes(query)
    ) {
      continue;
    }
    nodes.push({
      id: dir.id,
      type: "directory",
      position: { x: 0, y: 0 },
      data: {
        entityType: "directory",
        entity: dir,
        label: dir.name || "root",
      },
    });
  }

  // Project files
  for (const file of Object.values(scopedGraph.files)) {
    if (
      query &&
      !file.name.toLowerCase().includes(query) &&
      !file.path.toLowerCase().includes(query)
    ) {
      continue;
    }
    nodes.push({
      id: file.id,
      type: "file",
      position: { x: 0, y: 0 },
      data: {
        entityType: "file",
        entity: file,
        label: file.name,
      },
    });
  }

  // Project symbols
  for (const sym of Object.values(scopedGraph.symbols)) {
    if (query && !sym.name.toLowerCase().includes(query)) {
      continue;
    }
    nodes.push({
      id: sym.id,
      type: "symbol",
      position: { x: 0, y: 0 },
      hidden: true,
      data: {
        entityType: "symbol",
        entity: sym,
        label: sym.name,
      },
    });
  }

  // Project external modules
  for (const ext of Object.values(scopedGraph.externalModules)) {
    if (query && !ext.name.toLowerCase().includes(query)) {
      continue;
    }
    nodes.push({
      id: ext.id,
      type: "external",
      position: { x: 0, y: 0 },
      data: {
        entityType: "external",
        entity: ext,
        label: ext.name,
      },
    });
  }

  const activeNodeIds = new Set(nodes.map((n) => n.id));

  // Project edges: only include edges whose endpoints are both in activeNodeIds
  const edges: CodebaseReactFlowEdge[] = [];
  for (const edge of Object.values(scopedGraph.edges)) {
    if (allowedEdgeKinds && !allowedEdgeKinds.has(edge.kind)) {
      continue;
    }

    if (
      !activeNodeIds.has(edge.sourceId) ||
      !activeNodeIds.has(edge.targetId)
    ) {
      continue;
    }

    edges.push({
      id: edge.id,
      source: edge.sourceId,
      target: edge.targetId,
      type: edge.kind,
      ...(edge.weight > 1 ? { label: `x${edge.weight}` } : {}),
      data: {
        kind: edge.kind,
        weight: edge.weight,
        isExternal: edge.isExternal,
        ...(edge.metadata ? { metadata: edge.metadata } : {}),
      },
    });
  }

  return {
    nodes: Object.freeze(nodes),
    edges: Object.freeze(edges),
  };
}
