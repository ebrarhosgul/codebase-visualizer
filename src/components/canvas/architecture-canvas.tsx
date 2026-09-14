"use client";

import React, { useEffect, useMemo, useCallback } from "react";
import {
  ReactFlow,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  type NodeMouseHandler,
  Background,
  BackgroundVariant,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Sparkles, Network, FilterX, RotateCcw } from "lucide-react";
import { codebaseNodeTypes } from "./node-types";
import { GraphControlsToolbar } from "./graph-controls-toolbar";
import { CustomMiniMap } from "./custom-minimap";
import { LayerFilterBar } from "./layer-filter-bar";
import { Button } from "@/components/ui/button";
import { toReactFlowElements } from "@/graph/adapters/react-flow-adapter";
import { computeDagreLayout } from "@/graph/layout/dagre-layout";
import { useGraphStore } from "@/stores/graph-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { cn } from "@/lib/utils";
import type { CodebaseReactFlowNode, CodebaseReactFlowEdge } from "@/graph";

export interface ArchitectureCanvasProps {
  readonly className?: string;
}

/**
 * Inner React Flow canvas with store integration and camera controls.
 */
function ArchitectureCanvasInner({
  className,
}: ArchitectureCanvasProps): React.JSX.Element {
  const graph = useGraphStore((state) => state.graph);
  const selectedNodeId = useGraphStore((state) => state.selectedNodeId);
  const selectedFileId = useGraphStore((state) => state.selectedFileId);
  const hoveredNodeId = useGraphStore((state) => state.hoveredNodeId);
  const selectNode = useGraphStore((state) => state.selectNode);
  const setHoveredNodeId = useGraphStore((state) => state.setHoveredNodeId);
  const isIngesting = useGraphStore((state) => state.isIngesting);
  const selectedLayers = useGraphStore((state) => state.selectedLayers);
  const collapsedFolderIds = useGraphStore((state) => state.collapsedFolderIds);
  const searchQuery = useGraphStore((state) => state.searchQuery);
  const hideExternal = useGraphStore((state) => state.hideExternal);
  const resetAllFilters = useGraphStore((state) => state.resetAllFilters);
  const activeTrace = useGraphStore((state) => state.activeTrace);
  const activeStepIndex = useGraphStore((state) => state.activeStepIndex);
  const highlightedNodeIds = useGraphStore((state) => state.highlightedNodeIds);
  const highlightedEdgeIds = useGraphStore((state) => state.highlightedEdgeIds);
  const isSmallScreen = useWorkspaceStore((state) => state.isSmallScreen);
  const isLeftCollapsed = useWorkspaceStore(
    (state) => state.isLeftSidebarCollapsed,
  );
  const isRightCollapsed = useWorkspaceStore(
    (state) => state.isRightPanelCollapsed,
  );
  const setActiveRightTab = useWorkspaceStore(
    (state) => state.setActiveRightTab,
  );
  const theme = useWorkspaceStore((state) => state.theme);

  const [isMinimapVisible, setIsMinimapVisible] = React.useState(true);
  const [isFollowCursorActive, setIsFollowCursorActive] = React.useState(true);
  const { fitView, zoomIn, zoomOut, getZoom, setCenter, getViewport } =
    useReactFlow();
  const activeTarget = useGraphStore((state) => state.activeTarget);

  // Compute positioned React Flow elements using pure transformation and Dagre layout with compound folders
  const { initialNodes, initialEdges } = useMemo(() => {
    if (!graph || Object.keys(graph.files).length === 0) {
      return { initialNodes: [], initialEdges: [] };
    }

    const rawElements = toReactFlowElements(graph, {
      scope: {
        granularity: "files",
        includeExternal: !hideExternal,
      },
      enabledEdgeKinds: ["file_import", "re_export"],
      filters: {
        selectedLayers,
        collapsedFolderIds,
        searchQuery,
        hideExternal,
      },
    });

    const positioned = computeDagreLayout(rawElements, {
      direction: "LR",
      nodeWidth: 240,
      nodeHeight: 80,
      nodeSeparation: 50,
      rankSeparation: 100,
      groupByFolder: true,
    });

    const styledEdges = positioned.edges.map((edge) => ({
      ...edge,
      type: "smoothstep",
      style: {
        stroke: "#475569",
        strokeWidth: 1.5,
        opacity: 0.6,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: "#64748b",
        width: 12,
        height: 12,
      },
    }));

    return {
      initialNodes: positioned.nodes as CodebaseReactFlowNode[],
      initialEdges: styledEdges as CodebaseReactFlowEdge[],
    };
  }, [graph, selectedLayers, collapsedFolderIds, searchQuery, hideExternal]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const lastCenteredTargetKeyRef = React.useRef<string | null>(null);
  const nodesRef = React.useRef(nodes);
  nodesRef.current = nodes;

  // Active target for dependency highlighting (hover takes visual priority, falling back to selection/target)
  const rawHighlightId =
    hoveredNodeId ||
    selectedNodeId ||
    (activeTarget ? activeTarget.symbolId || activeTarget.fileId : null);

  // Canvas nodes and edges operate at file granularity; resolve symbol IDs to their containing file
  const highlightNodeId = useMemo(() => {
    if (!rawHighlightId) return null;
    if (rawHighlightId.startsWith("symbol:")) {
      return (
        graph?.symbols[rawHighlightId]?.fileId ??
        activeTarget?.fileId ??
        selectedFileId ??
        rawHighlightId
      );
    }
    return rawHighlightId;
  }, [rawHighlightId, graph, activeTarget?.fileId, selectedFileId]);

  // Pre-index graph edges by source and target for O(degree) lookup instead of O(E) full scan
  const edgeIndex = useMemo(() => {
    if (!graph) {
      return {
        outgoingByNode: new Map<
          string,
          Array<{ id: string; targetId: string }>
        >(),
        incomingByNode: new Map<
          string,
          Array<{ id: string; sourceId: string }>
        >(),
      };
    }

    const outgoingByNode = new Map<
      string,
      Array<{ id: string; targetId: string }>
    >();
    const incomingByNode = new Map<
      string,
      Array<{ id: string; sourceId: string }>
    >();

    for (const edge of Object.values(graph.edges)) {
      let outList = outgoingByNode.get(edge.sourceId);
      if (!outList) {
        outList = [];
        outgoingByNode.set(edge.sourceId, outList);
      }
      outList.push({ id: edge.id, targetId: edge.targetId });

      let inList = incomingByNode.get(edge.targetId);
      if (!inList) {
        inList = [];
        incomingByNode.set(edge.targetId, inList);
      }
      inList.push({ id: edge.id, sourceId: edge.sourceId });
    }

    return { outgoingByNode, incomingByNode };
  }, [graph]);

  // Compute connected incoming and outgoing node/edge sets for current highlight target
  const { connectedNodeIds, outgoingEdgeIds, incomingEdgeIds } = useMemo(() => {
    if (!highlightNodeId || !graph) {
      return {
        connectedNodeIds: new Set<string>(),
        outgoingEdgeIds: new Set<string>(),
        incomingEdgeIds: new Set<string>(),
      };
    }

    const connectedNodes = new Set<string>([highlightNodeId]);
    const outgoingEdges = new Set<string>();
    const incomingEdges = new Set<string>();

    const outList = edgeIndex.outgoingByNode.get(highlightNodeId);
    if (outList) {
      for (const edge of outList) {
        connectedNodes.add(edge.targetId);
        outgoingEdges.add(edge.id);
      }
    }

    const inList = edgeIndex.incomingByNode.get(highlightNodeId);
    if (inList) {
      for (const edge of inList) {
        connectedNodes.add(edge.sourceId);
        incomingEdges.add(edge.id);
      }
    }

    return {
      connectedNodeIds: connectedNodes,
      outgoingEdgeIds: outgoingEdges,
      incomingEdgeIds: incomingEdges,
    };
  }, [highlightNodeId, graph, edgeIndex]);

  // Sync state whenever underlying graph is recomputed
  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);

    if (initialNodes.length > 0) {
      const hasTarget = Boolean(
        useGraphStore.getState().activeTarget ||
        useGraphStore.getState().pendingTarget,
      );
      if (!hasTarget) {
        const timer = setTimeout(() => {
          fitView({ padding: 0.2, duration: 400 });
        }, 50);
        return () => clearTimeout(timer);
      }
    }
  }, [initialNodes, initialEdges, setNodes, setEdges, fitView]);

  // Sync node selection, active folder container, and hover/connection visual states
  useEffect(() => {
    const isHighlightActive = Boolean(highlightNodeId);
    const isTraceActive = Boolean(activeTrace);
    const traceNodeSet = new Set(highlightedNodeIds);
    const activeStepNodeId =
      activeTrace && activeStepIndex !== null && activeStepIndex >= 0
        ? (activeTrace.stepNodeIds[activeStepIndex] ?? null)
        : null;

    setNodes((currentNodes) => {
      let changed = false;
      const nextNodes = currentNodes.map((n) => {
        if (n.type === "folderGroup") {
          const entity = n.data?.entity as
            { childFileIds?: readonly string[] } | undefined;
          const childIds = entity?.childFileIds ?? [];
          const hasActiveChild = childIds.some(
            (id) =>
              (isTraceActive && traceNodeSet.has(id)) ||
              id === highlightNodeId ||
              id === selectedNodeId ||
              id === activeTarget?.fileId ||
              id === activeTarget?.symbolId,
          );
          if (
            n.data?.hasActiveChild === hasActiveChild &&
            n.data?.isHighlighted === hasActiveChild
          ) {
            return n;
          }
          changed = true;
          return {
            ...n,
            data: {
              ...n.data,
              hasActiveChild,
              isHighlighted: hasActiveChild,
            },
          };
        }

        if (isTraceActive) {
          const isTraceNode = traceNodeSet.has(n.id);
          const isStepFocused = activeStepNodeId === n.id;
          const isSelected = n.id === selectedNodeId || isStepFocused;
          const isHovered = isStepFocused || hoveredNodeId === n.id;
          const isConnected = isTraceNode;
          const isDimmed = !isTraceNode;

          if (
            n.selected === isSelected &&
            n.data?.isHovered === isHovered &&
            n.data?.isConnected === isConnected &&
            n.data?.isDimmed === isDimmed
          ) {
            return n;
          }
          changed = true;
          return {
            ...n,
            selected: isSelected,
            data: {
              ...n.data,
              isHovered,
              isConnected,
              isDimmed,
            },
          };
        }

        const isTarget = n.id === highlightNodeId;
        const isConnected = connectedNodeIds.has(n.id);
        const isSelected =
          n.id === selectedNodeId ||
          n.id === highlightNodeId ||
          (activeTarget != null &&
            (n.id === activeTarget.symbolId || n.id === activeTarget.fileId));
        const isHovered = isTarget && hoveredNodeId === n.id;
        const isDimmed = isHighlightActive && !isTarget && !isConnected;

        if (
          n.selected === isSelected &&
          n.data?.isHovered === isHovered &&
          n.data?.isConnected === isConnected &&
          n.data?.isDimmed === isDimmed
        ) {
          return n;
        }
        changed = true;
        return {
          ...n,
          selected: isSelected,
          data: {
            ...n.data,
            isHovered,
            isConnected,
            isDimmed,
          },
        };
      });

      return changed ? nextNodes : currentNodes;
    });
  }, [
    selectedNodeId,
    activeTarget,
    highlightNodeId,
    connectedNodeIds,
    hoveredNodeId,
    activeTrace,
    activeStepIndex,
    highlightedNodeIds,
    setNodes,
  ]);

  // Sync edge visual states (highlighting connected imports/importers or active trace path)
  useEffect(() => {
    const isHighlightActive = Boolean(highlightNodeId);
    const isTraceActive = Boolean(activeTrace);
    const traceEdgeSet = new Set(highlightedEdgeIds);

    const getMarkerColor = (marker: unknown): string | undefined => {
      if (typeof marker === "object" && marker !== null && "color" in marker) {
        return (marker as { color?: string }).color;
      }
      return undefined;
    };

    setEdges((currentEdges) => {
      let changed = false;
      const nextEdges = currentEdges.map((e) => {
        if (isTraceActive) {
          if (traceEdgeSet.has(e.id)) {
            if (
              e.animated === true &&
              e.style?.stroke === "#38bdf8" &&
              e.style?.strokeWidth === 3 &&
              e.style?.opacity === 1 &&
              getMarkerColor(e.markerEnd) === "#38bdf8"
            ) {
              return e;
            }
            changed = true;
            return {
              ...e,
              animated: true,
              style: {
                stroke: "#38bdf8",
                strokeWidth: 3,
                filter: "drop-shadow(0 1px 2px rgba(0, 0, 0, 0.4))",
                opacity: 1,
              },
              markerEnd: {
                type: MarkerType.ArrowClosed,
                color: "#38bdf8",
                width: 16,
                height: 16,
              },
            };
          }
          if (
            e.animated === false &&
            e.style?.stroke === "#1e293b" &&
            e.style?.strokeWidth === 1 &&
            e.style?.opacity === 0.15 &&
            getMarkerColor(e.markerEnd) === "#334155"
          ) {
            return e;
          }
          changed = true;
          return {
            ...e,
            animated: false,
            style: {
              stroke: "#1e293b",
              strokeWidth: 1,
              opacity: 0.15,
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: "#334155",
              width: 10,
              height: 10,
            },
          };
        }

        const isOutgoing =
          e.source === highlightNodeId || outgoingEdgeIds.has(e.id);
        const isIncoming =
          e.target === highlightNodeId || incomingEdgeIds.has(e.id);

        if (isHighlightActive) {
          if (isOutgoing) {
            if (
              e.animated === true &&
              e.style?.stroke === "#38bdf8" &&
              e.style?.strokeWidth === 3 &&
              e.style?.opacity === 1 &&
              getMarkerColor(e.markerEnd) === "#38bdf8"
            ) {
              return e;
            }
            changed = true;
            return {
              ...e,
              animated: true,
              style: {
                stroke: "#38bdf8",
                strokeWidth: 3,
                filter: "drop-shadow(0 1px 2px rgba(0, 0, 0, 0.4))",
                opacity: 1,
              },
              markerEnd: {
                type: MarkerType.ArrowClosed,
                color: "#38bdf8",
                width: 16,
                height: 16,
              },
            };
          }
          if (isIncoming) {
            if (
              e.animated === true &&
              e.style?.stroke === "#a78bfa" &&
              e.style?.strokeWidth === 2.5 &&
              e.style?.opacity === 1 &&
              getMarkerColor(e.markerEnd) === "#a78bfa"
            ) {
              return e;
            }
            changed = true;
            return {
              ...e,
              animated: true,
              style: {
                stroke: "#a78bfa",
                strokeWidth: 2.5,
                opacity: 1,
              },
              markerEnd: {
                type: MarkerType.ArrowClosed,
                color: "#a78bfa",
                width: 14,
                height: 14,
              },
            };
          }
          if (
            e.animated === false &&
            e.style?.stroke === "#1e293b" &&
            e.style?.strokeWidth === 1 &&
            e.style?.opacity === 0.2 &&
            getMarkerColor(e.markerEnd) === "#334155"
          ) {
            return e;
          }
          changed = true;
          return {
            ...e,
            animated: false,
            style: {
              stroke: "#1e293b",
              strokeWidth: 1,
              opacity: 0.2,
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: "#334155",
              width: 10,
              height: 10,
            },
          };
        }

        // Default idle edge state
        if (
          e.animated === false &&
          e.style?.stroke === "#475569" &&
          e.style?.strokeWidth === 1.5 &&
          e.style?.opacity === 0.6 &&
          getMarkerColor(e.markerEnd) === "#64748b"
        ) {
          return e;
        }
        changed = true;
        return {
          ...e,
          animated: false,
          style: {
            stroke: "#475569",
            strokeWidth: 1.5,
            opacity: 0.6,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: "#64748b",
            width: 12,
            height: 12,
          },
        };
      });

      return changed ? nextEdges : currentEdges;
    });
  }, [
    highlightNodeId,
    outgoingEdgeIds,
    incomingEdgeIds,
    activeTrace,
    highlightedEdgeIds,
    setEdges,
  ]);

  // Programmatically center camera when activeTarget updates from editor, tree, or url (AC-3, AC-4)
  useEffect(() => {
    if (!activeTarget || activeTarget.source === "canvas") {
      return;
    }

    // Look for target node in layout initialNodes or current nodes
    const targetId = activeTarget.symbolId || activeTarget.fileId;
    const targetNode =
      initialNodes.find((n) => n.id === targetId) ||
      initialNodes.find((n) => n.id === activeTarget.fileId) ||
      nodesRef.current.find((n) => n.id === targetId) ||
      nodesRef.current.find((n) => n.id === activeTarget.fileId);

    if (!targetNode) {
      return;
    }

    const anyNode = targetNode as unknown as {
      measured?: { width: number; height: number };
      width?: number;
      height?: number;
    };
    const nodeWidth = anyNode.measured?.width ?? anyNode.width ?? 240;
    const nodeHeight = anyNode.measured?.height ?? anyNode.height ?? 80;
    const centerX = targetNode.position.x + nodeWidth / 2;
    const centerY = targetNode.position.y + nodeHeight / 2;

    // Handle editor cursor updates
    if (activeTarget.source === "editor") {
      // If user paused cursor follow mode, do not move the camera
      if (!isFollowCursorActive) {
        return;
      }

      // Check if target node is already visible inside current canvas viewport
      if (typeof window !== "undefined" && getViewport) {
        const viewport = getViewport();
        const container = document.querySelector(".react-flow");
        const containerWidth =
          container?.clientWidth || window.innerWidth * 0.6;
        const containerHeight =
          container?.clientHeight || window.innerHeight * 0.8;

        const screenX = targetNode.position.x * viewport.zoom + viewport.x;
        const screenY = targetNode.position.y * viewport.zoom + viewport.y;
        const screenW = nodeWidth * viewport.zoom;
        const screenH = nodeHeight * viewport.zoom;

        const margin = 40;
        const isVisible =
          screenX >= margin &&
          screenY >= margin &&
          screenX + screenW <= containerWidth - margin &&
          screenY + screenH <= containerHeight - margin;

        // If node is already visible, keep camera steady so flow tracking is not disrupted
        if (isVisible) {
          return;
        }
      }

      const targetKey = `editor:${targetNode.id}`;
      if (lastCenteredTargetKeyRef.current === targetKey) {
        return;
      }
      lastCenteredTargetKeyRef.current = targetKey;

      setCenter(centerX, centerY, { zoom: 1.2, duration: 800 });
      return;
    }

    // Explicit navigation (url, search)
    const targetKey = `${activeTarget.source}:${targetNode.id}:${activeTarget.timestamp}`;
    if (lastCenteredTargetKeyRef.current === targetKey) {
      return;
    }
    lastCenteredTargetKeyRef.current = targetKey;

    setCenter(centerX, centerY, { zoom: 1.2, duration: 800 });
  }, [
    activeTarget,
    initialNodes,
    setCenter,
    getZoom,
    getViewport,
    isFollowCursorActive,
  ]);

  // Handle node selection: synchronize selection, navigate target, and switch right tab to code (AC-2, AC-7)
  const handleNodeClick: NodeMouseHandler = useCallback(
    (_, node) => {
      selectNode(node.id);
      setActiveRightTab("code");
      useWorkspaceStore.getState().setRightPanelCollapsed(false);
      if (useWorkspaceStore.getState().isSmallScreen) {
        useWorkspaceStore.getState().setRightDrawerOpen(true);
      }
    },
    [selectNode, setActiveRightTab],
  );

  // Handle canvas background click to clear selection
  const handlePaneClick = useCallback(() => {
    selectNode(null);
    lastCenteredTargetKeyRef.current = null;
  }, [selectNode]);

  const handleMoveStart = useCallback(() => {
    // Preserve lastCenteredTargetKeyRef to prevent canvas panning from causing sudden auto-centering
  }, []);

  const handleNodeMouseEnter: NodeMouseHandler = useCallback(
    (_, node) => {
      if (node.type !== "folderGroup") {
        setHoveredNodeId(node.id);
      }
    },
    [setHoveredNodeId],
  );

  const handleNodeMouseLeave: NodeMouseHandler = useCallback(() => {
    setHoveredNodeId(null);
  }, [setHoveredNodeId]);

  // Empty or Welcome state when no graph is loaded
  if (!graph || Object.keys(graph.files).length === 0) {
    return (
      <div
        className={`relative w-full h-full flex flex-col items-center justify-center p-8 bg-[var(--surface-canvas)] select-none ${className ?? ""}`}
        data-testid="canvas-empty-state"
      >
        <div className="max-w-md text-center space-y-4 z-10">
          <div className="w-12 h-12 rounded-xl bg-[var(--surface-panel-secondary)] border border-[var(--border-default)] flex items-center justify-center mx-auto text-[var(--accent-primary)] shadow-sm">
            <Network className="w-6 h-6" />
          </div>

          <div className="space-y-1">
            <h2 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
              {isIngesting
                ? "Analyzing Codebase Architecture..."
                : "Architecture Graph Canvas"}
            </h2>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {isIngesting
                ? "Streaming repository archive and parsing abstract syntax tree dependencies..."
                : "Submit a public GitHub repository link in the header bar above to visualize modules, imports, and source code side by side."}
            </p>
          </div>

          {!isIngesting && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--surface-panel)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)]">
              <Sparkles className="w-3 h-3 text-[var(--accent-primary)]" />
              <span>Try entering facebook/react or vercel/next.js</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Filtered empty state when filters exclude all nodes (AC-10)
  if (initialNodes.length === 0) {
    return (
      <div
        className={`relative w-full h-full bg-[var(--surface-canvas)] flex flex-col ${className ?? ""}`}
        data-testid="canvas-filtered-empty-state"
      >
        <div
          className={cn(
            "absolute top-3 z-20 pointer-events-none flex items-start max-w-[calc(100%-24px)]",
            !isSmallScreen && isLeftCollapsed ? "left-12" : "left-3",
          )}
        >
          <div className="pointer-events-auto min-w-0 max-w-full">
            <LayerFilterBar />
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center select-none">
          <div className="max-w-md space-y-4">
            <div className="w-12 h-12 rounded-xl bg-[var(--surface-panel-secondary)] border border-[var(--border-default)] flex items-center justify-center mx-auto text-amber-400 shadow-sm">
              <FilterX className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h2 className="text-lg font-bold tracking-tight text-[var(--text-primary)]">
                No matching architectural nodes
              </h2>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                All modules and files have been filtered out by the active
                layer, folder collapse, or search criteria.
              </p>
            </div>

            <Button
              variant="primary"
              onClick={resetAllFilters}
              className="gap-2 mx-auto text-xs"
              data-testid="empty-reset-filters-btn"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset all filters</span>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative w-full h-full bg-[var(--surface-canvas)] ${className ?? ""}`}
      data-testid="architecture-canvas"
    >
      {/* Floating Controls Bar (Layer Filters & Canvas Zoom Controls) */}
      <div
        className={cn(
          "absolute top-3 z-20 pointer-events-none flex items-start justify-between gap-3",
          !isSmallScreen && isLeftCollapsed ? "left-12" : "left-3",
          !isSmallScreen && isRightCollapsed ? "right-12" : "right-3",
        )}
      >
        <div className="pointer-events-auto min-w-0 max-w-full">
          <LayerFilterBar />
        </div>

        <div className="pointer-events-auto shrink-0">
          <GraphControlsToolbar
            onZoomIn={() => zoomIn({ duration: 200 })}
            onZoomOut={() => zoomOut({ duration: 200 })}
            onFitView={() => fitView({ padding: 0.2, duration: 300 })}
            isMinimapVisible={isMinimapVisible}
            onToggleMinimap={() => setIsMinimapVisible(!isMinimapVisible)}
            isFollowCursorActive={isFollowCursorActive}
            onToggleFollowCursor={() =>
              setIsFollowCursorActive((prev) => !prev)
            }
            currentZoom={getZoom ? Math.round(getZoom() * 10) / 10 : 1.0}
          />
        </div>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        colorMode={theme === "light" ? "light" : "dark"}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onNodeMouseEnter={handleNodeMouseEnter}
        onNodeMouseLeave={handleNodeMouseLeave}
        onPaneClick={handlePaneClick}
        onMoveStart={handleMoveStart}
        nodeTypes={codebaseNodeTypes}
        minZoom={0.2}
        maxZoom={2.5}
        onlyRenderVisibleElements={true}
        defaultEdgeOptions={{
          type: "smoothstep",
          animated: false,
          style: { stroke: "#475569", strokeWidth: 1.5, opacity: 0.6 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: "#64748b",
            width: 12,
            height: 12,
          },
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={16}
          size={1}
          color="rgba(255, 255, 255, 0.05)"
        />
        {isMinimapVisible && <CustomMiniMap />}
      </ReactFlow>
    </div>
  );
}

/**
 * Public ArchitectureCanvas wrapped in ReactFlowProvider.
 */
export const ArchitectureCanvas = React.memo(function ArchitectureCanvas(
  props: ArchitectureCanvasProps,
): React.JSX.Element {
  return (
    <ReactFlowProvider>
      <ArchitectureCanvasInner {...props} />
    </ReactFlowProvider>
  );
});
