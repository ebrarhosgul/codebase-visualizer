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
  const setActiveRightTab = useWorkspaceStore(
    (state) => state.setActiveRightTab,
  );

  const [isMinimapVisible, setIsMinimapVisible] = React.useState(true);
  const [isFollowCursorActive, setIsFollowCursorActive] = React.useState(true);
  const { fitView, zoomIn, zoomOut, getZoom, setCenter, getViewport } =
    useReactFlow();
  const activeTarget = useGraphStore((state) => state.activeTarget);
  const navigateToTarget = useGraphStore((state) => state.navigateToTarget);

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
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: "var(--border-focus)",
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

  // Active target for dependency highlighting (hover takes visual priority, falling back to selection/target)
  const highlightNodeId =
    hoveredNodeId ||
    selectedNodeId ||
    (activeTarget ? activeTarget.symbolId || activeTarget.fileId : null);

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

    for (const edge of Object.values(graph.edges)) {
      if (edge.sourceId === highlightNodeId) {
        connectedNodes.add(edge.targetId);
        outgoingEdges.add(edge.id);
      }
      if (edge.targetId === highlightNodeId) {
        connectedNodes.add(edge.sourceId);
        incomingEdges.add(edge.id);
      }
    }

    return {
      connectedNodeIds: connectedNodes,
      outgoingEdgeIds: outgoingEdges,
      incomingEdgeIds: incomingEdges,
    };
  }, [highlightNodeId, graph]);

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

    setNodes((currentNodes) =>
      currentNodes.map((n) => {
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

          return {
            ...n,
            selected: isSelected,
            data: {
              ...n.data,
              isHovered: isStepFocused || hoveredNodeId === n.id,
              isConnected: isTraceNode,
              isDimmed: !isTraceNode,
            },
          };
        }

        const isTarget = n.id === highlightNodeId;
        const isConnected = connectedNodeIds.has(n.id);
        const isSelected =
          n.id === selectedNodeId ||
          (activeTarget != null &&
            (n.id === activeTarget.symbolId || n.id === activeTarget.fileId));

        return {
          ...n,
          selected: isSelected,
          data: {
            ...n.data,
            isHovered: isTarget && hoveredNodeId === n.id,
            isConnected,
            isDimmed: isHighlightActive && !isTarget && !isConnected,
          },
        };
      }),
    );
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

    setEdges((currentEdges) =>
      currentEdges.map((e) => {
        if (isTraceActive) {
          if (traceEdgeSet.has(e.id)) {
            return {
              ...e,
              animated: true,
              style: {
                stroke: "var(--accent-primary)",
                strokeWidth: 3,
                filter: "drop-shadow(0 0 6px rgba(59, 130, 246, 0.7))",
                opacity: 1,
              },
              markerEnd: {
                type: MarkerType.ArrowClosed,
                color: "var(--accent-primary)",
                width: 16,
                height: 16,
              },
            };
          }
          return {
            ...e,
            animated: false,
            style: {
              stroke: "var(--border-subtle)",
              strokeWidth: 1,
              opacity: 0.12,
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: "var(--border-subtle)",
              width: 10,
              height: 10,
            },
          };
        }

        const isOutgoing = outgoingEdgeIds.has(e.id);
        const isIncoming = incomingEdgeIds.has(e.id);

        if (isHighlightActive) {
          if (isOutgoing) {
            return {
              ...e,
              animated: true,
              style: {
                stroke: "var(--accent-primary)",
                strokeWidth: 2.5,
                opacity: 1,
              },
              markerEnd: {
                type: MarkerType.ArrowClosed,
                color: "var(--accent-primary)",
                width: 14,
                height: 14,
              },
            };
          }
          if (isIncoming) {
            return {
              ...e,
              animated: true,
              style: {
                stroke: "var(--syntax-ts)",
                strokeWidth: 2.5,
                opacity: 1,
              },
              markerEnd: {
                type: MarkerType.ArrowClosed,
                color: "var(--syntax-ts)",
                width: 14,
                height: 14,
              },
            };
          }
          return {
            ...e,
            animated: false,
            style: {
              stroke: "var(--border-subtle)",
              strokeWidth: 1,
              opacity: 0.12,
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: "var(--border-subtle)",
              width: 10,
              height: 10,
            },
          };
        }

        // Default idle edge state
        return {
          ...e,
          animated: false,
          style: {
            stroke: "var(--border-focus)",
            strokeWidth: 1.5,
            opacity: 0.4,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: "var(--border-focus)",
            width: 12,
            height: 12,
          },
        };
      }),
    );
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

    // Look for target node in current nodes state or layout initialNodes
    const targetId = activeTarget.symbolId || activeTarget.fileId;
    const targetNode =
      nodes.find((n) => n.id === targetId) ||
      nodes.find((n) => n.id === activeTarget.fileId) ||
      initialNodes.find((n) => n.id === targetId) ||
      initialNodes.find((n) => n.id === activeTarget.fileId);

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
    nodes,
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

      if (node.id.startsWith("file:")) {
        navigateToTarget({
          fileId: node.id,
          source: "canvas",
          timestamp: Date.now(),
        });
      } else if (node.id.startsWith("symbol:")) {
        const symbol = graph?.symbols[node.id];
        if (symbol) {
          navigateToTarget({
            fileId: symbol.fileId,
            symbolId: symbol.id,
            line: symbol.range.startLine,
            column: symbol.range.startColumn,
            source: "canvas",
            timestamp: Date.now(),
          });
        }
      }
    },
    [selectNode, setActiveRightTab, navigateToTarget, graph],
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
        <div className="absolute top-3 left-4 right-16 sm:right-auto sm:left-1/2 sm:-translate-x-1/2 z-20 max-w-[calc(100%-120px)] sm:max-w-[calc(100%-180px)]">
          <LayerFilterBar />
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
      {/* Floating Layer Filter Bar (AC-2) */}
      <div className="absolute top-3 left-4 right-16 sm:right-auto sm:left-1/2 sm:-translate-x-1/2 z-20 max-w-[calc(100%-120px)] sm:max-w-[calc(100%-180px)]">
        <LayerFilterBar />
      </div>

      {/* Floating Toolbar Controls */}
      <div className="absolute top-3 right-3 z-20">
        <GraphControlsToolbar
          onZoomIn={() => zoomIn({ duration: 200 })}
          onZoomOut={() => zoomOut({ duration: 200 })}
          onFitView={() => fitView({ padding: 0.2, duration: 300 })}
          isMinimapVisible={isMinimapVisible}
          onToggleMinimap={() => setIsMinimapVisible(!isMinimapVisible)}
          isFollowCursorActive={isFollowCursorActive}
          onToggleFollowCursor={() => setIsFollowCursorActive((prev) => !prev)}
          currentZoom={getZoom ? Math.round(getZoom() * 10) / 10 : 1.0}
        />
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
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
        defaultEdgeOptions={{
          type: "smoothstep",
          animated: false,
          style: { stroke: "var(--border-focus)", strokeWidth: 1.5 },
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={16}
          size={1}
          color="rgba(148, 163, 184, 0.15)"
        />
        {isMinimapVisible && <CustomMiniMap />}
      </ReactFlow>
    </div>
  );
}

/**
 * Public ArchitectureCanvas wrapped in ReactFlowProvider.
 */
export function ArchitectureCanvas(
  props: ArchitectureCanvasProps,
): React.JSX.Element {
  return (
    <ReactFlowProvider>
      <ArchitectureCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
