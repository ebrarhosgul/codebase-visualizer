"use client";

import React, { useEffect, useMemo, useCallback } from "react";
import {
  ReactFlow,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useOnViewportChange,
  ReactFlowProvider,
  type NodeMouseHandler,
  Background,
  BackgroundVariant,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useShallow } from "zustand/react/shallow";
import {
  ArrowUp,
  ArrowUpRight,
  GitBranch,
  FilterX,
  RotateCcw,
  AlertTriangle,
} from "lucide-react";
import { codebaseNodeTypes } from "./node-types";
import { GraphControlsToolbar } from "./graph-controls-toolbar";
import { useEffectiveTheme } from "@/hooks/use-effective-theme";
import { CustomMiniMap } from "./custom-minimap";
import { LayerFilterBar } from "./layer-filter-bar";
import { Button } from "@/components/ui/button";
import { DEMO_REPOS } from "@/components/workspace/repo-submission-bar";
import { useAsyncGraphLayout } from "@/hooks/use-async-graph-layout";
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
  const theme = useEffectiveTheme();
  const graph = useGraphStore((state) => state.graph);
  const selectedNodeId = useGraphStore((state) => state.selectedNodeId);
  const selectedFileId = useGraphStore((state) => state.selectedFileId);
  const selectNode = useGraphStore((state) => state.selectNode);
  const setHoveredNodeId = useGraphStore((state) => state.setHoveredNodeId);
  const isIngesting = useGraphStore((state) => state.isIngesting);
  const resetAllFilters = useGraphStore((state) => state.resetAllFilters);
  const activeTarget = useGraphStore((state) => state.activeTarget);
  const startIngestion = useGraphStore((state) => state.startIngestion);

  const { selectedLayers, collapsedFolderIds, searchQuery, hideExternal } =
    useGraphStore(
      useShallow((state) => ({
        selectedLayers: state.selectedLayers,
        collapsedFolderIds: state.collapsedFolderIds,
        searchQuery: state.searchQuery,
        hideExternal: state.hideExternal,
      })),
    );

  const {
    activeTrace,
    activeStepIndex,
    highlightedNodeIds,
    highlightedEdgeIds,
    highlightSource,
  } = useGraphStore(
    useShallow((state) => ({
      activeTrace: state.activeTrace,
      activeStepIndex: state.activeStepIndex,
      highlightedNodeIds: state.highlightedNodeIds,
      highlightedEdgeIds: state.highlightedEdgeIds,
      highlightSource: state.highlightSource,
    })),
  );

  const {
    isSmallScreen,
    isLeftCollapsed,
    isRightCollapsed,
    setActiveRightTab,
  } = useWorkspaceStore(
    useShallow((state) => ({
      isSmallScreen: state.isSmallScreen,
      isLeftCollapsed: state.isLeftSidebarCollapsed,
      isRightCollapsed: state.isRightPanelCollapsed,
      setActiveRightTab: state.setActiveRightTab,
    })),
  );

  const [isMinimapVisible, setIsMinimapVisible] = React.useState(true);
  const [isFollowCursorActive, setIsFollowCursorActive] = React.useState(true);
  const { fitView, zoomIn, zoomOut, getZoom, setCenter, getViewport } =
    useReactFlow();
  const getZoomRef = React.useRef(getZoom);
  getZoomRef.current = getZoom;

  // Compute positioned React Flow elements using asynchronous Web Worker layout with fallback
  const layoutFilters = useMemo(
    () => ({
      selectedLayers,
      collapsedFolderIds,
      searchQuery,
      hideExternal,
    }),
    [selectedLayers, collapsedFolderIds, searchQuery, hideExternal],
  );

  const {
    nodes: layoutNodes,
    edges: layoutEdges,
    isCalculating: isCalculatingLayout,
    error: layoutError,
  } = useAsyncGraphLayout(graph, layoutFilters);

  const [nodes, setNodes, onNodesChange] = useNodesState(
    layoutNodes as CodebaseReactFlowNode[],
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    layoutEdges as CodebaseReactFlowEdge[],
  );
  const lastCenteredTargetKeyRef = React.useRef<string | null>(null);
  const nodesRef = React.useRef(nodes);
  nodesRef.current = nodes;

  // Publish visible file IDs from laid-out nodes when layout completes (AC-7)
  useEffect(() => {
    if (!isCalculatingLayout) {
      const fileIds = layoutNodes
        .filter((n) => n.type === "file")
        .map((n) => n.id);
      useGraphStore.getState().setVisibleFileIds(fileIds);
    }
  }, [layoutNodes, isCalculatingLayout]);

  // Active target for dependency highlighting (selection takes visual priority, falling back to activeTarget)
  const rawHighlightId =
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

    const resolveNodeId = (id: string): string =>
      graph.symbols[id]?.fileId ?? id;

    for (const edge of Object.values(graph.edges)) {
      const sourceFileId = resolveNodeId(edge.sourceId);
      const targetFileId = resolveNodeId(edge.targetId);

      // Index by sourceFileId
      let outList = outgoingByNode.get(sourceFileId);
      if (!outList) {
        outList = [];
        outgoingByNode.set(sourceFileId, outList);
      }
      outList.push({ id: edge.id, targetId: targetFileId });

      if (sourceFileId !== edge.sourceId) {
        let rawOutList = outgoingByNode.get(edge.sourceId);
        if (!rawOutList) {
          rawOutList = [];
          outgoingByNode.set(edge.sourceId, rawOutList);
        }
        rawOutList.push({ id: edge.id, targetId: targetFileId });
      }

      // Index by targetFileId
      let inList = incomingByNode.get(targetFileId);
      if (!inList) {
        inList = [];
        incomingByNode.set(targetFileId, inList);
      }
      inList.push({ id: edge.id, sourceId: sourceFileId });

      if (targetFileId !== edge.targetId) {
        let rawInList = incomingByNode.get(edge.targetId);
        if (!rawInList) {
          rawInList = [];
          incomingByNode.set(edge.targetId, rawInList);
        }
        rawInList.push({ id: edge.id, sourceId: sourceFileId });
      }
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

  // Progressive disclosure: hide symbol nodes when zoom < 1.2, reveal when zoom >= 1.2 (AC-3, AC-4)
  const isSymbolsVisibleRef = React.useRef(false);
  const zoomThrottleTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  const handleViewportChange = useCallback(
    ({ zoom }: { zoom: number }) => {
      if (zoom < 1.0) {
        lastCenteredTargetKeyRef.current = null;
      }

      const shouldShowSymbols = zoom >= 1.2;
      if (shouldShowSymbols === isSymbolsVisibleRef.current) {
        return;
      }

      isSymbolsVisibleRef.current = shouldShowSymbols;

      if (zoomThrottleTimerRef.current) {
        clearTimeout(zoomThrottleTimerRef.current);
      }

      zoomThrottleTimerRef.current = setTimeout(() => {
        zoomThrottleTimerRef.current = null;
        setNodes((currentNodes) => {
          let hasChange = false;
          const nextNodes = currentNodes.map((n) => {
            if (n.type === "symbol" && n.hidden !== !shouldShowSymbols) {
              hasChange = true;
              return { ...n, hidden: !shouldShowSymbols };
            }
            return n;
          });
          return hasChange ? nextNodes : currentNodes;
        });
      }, 75);
    },
    [setNodes],
  );

  useOnViewportChange({
    onChange: handleViewportChange,
  });

  useEffect(() => {
    return () => {
      if (zoomThrottleTimerRef.current) {
        clearTimeout(zoomThrottleTimerRef.current);
        zoomThrottleTimerRef.current = null;
      }
    };
  }, []);

  // Sync state whenever underlying graph is recomputed
  useEffect(() => {
    if (zoomThrottleTimerRef.current) {
      clearTimeout(zoomThrottleTimerRef.current);
      zoomThrottleTimerRef.current = null;
    }

    const currentZoom = getZoomRef.current ? getZoomRef.current() : 1.0;
    const shouldShowSymbols = currentZoom >= 1.2;
    isSymbolsVisibleRef.current = shouldShowSymbols;

    const adjustedNodes = shouldShowSymbols
      ? layoutNodes.map((n) =>
          n.type === "symbol" ? { ...n, hidden: false } : n,
        )
      : layoutNodes;

    setNodes(adjustedNodes as CodebaseReactFlowNode[]);
    setEdges(layoutEdges as CodebaseReactFlowEdge[]);

    if (layoutNodes.length > 0) {
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
  }, [layoutNodes, layoutEdges, setNodes, setEdges, fitView]);

  // Sync node selection, active folder container, and connection visual states
  useEffect(() => {
    const isHighlightActive = Boolean(highlightNodeId);
    const isTraceActive = Boolean(activeTrace);
    const isAnswerHighlight = highlightSource === "answer";
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
              ((isTraceActive || isAnswerHighlight) && traceNodeSet.has(id)) ||
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

        if (isTraceActive || isAnswerHighlight) {
          const isKeyNode = traceNodeSet.has(n.id);
          const isStepFocused = isTraceActive && activeStepNodeId === n.id;
          const isSelected = n.id === selectedNodeId || isStepFocused;
          const isHovered = isStepFocused;
          const isConnected = isKeyNode;
          const isDimmed = !isKeyNode;

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
        const isHovered = false;
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
    activeTrace,
    activeStepIndex,
    highlightedNodeIds,
    highlightSource,
    setNodes,
  ]);

  // Sync edge visual states (highlighting connected imports/importers or active trace path)
  useEffect(() => {
    const isHighlightActive = Boolean(highlightNodeId);
    const isTraceActive = Boolean(activeTrace);
    const traceEdgeSet = new Set(highlightedEdgeIds);
    // React Flow includes marker colors in SVG ids, so keep these values free
    // of CSS variable syntax. The values mirror the semantic theme tokens.
    const markerStrong = theme === "light" ? "#777086" : "#918ba8";
    const markerAccent = theme === "light" ? "#7046d6" : "#b59aff";
    const markerText = theme === "light" ? "#5830b6" : "#d1beff";

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
              e.animated === false &&
              e.style?.stroke === "var(--accent-border)" &&
              e.style?.strokeWidth === 3 &&
              e.style?.strokeOpacity === 1 &&
              getMarkerColor(e.markerEnd) === markerAccent
            ) {
              return e;
            }
            changed = true;
            return {
              ...e,
              animated: false,
              style: {
                stroke: "var(--accent-border)",
                strokeWidth: 3,
                strokeOpacity: 1,
              },
              markerEnd: {
                type: MarkerType.ArrowClosed,
                color: markerAccent,
                width: 16,
                height: 16,
              },
            };
          }
          if (
            e.animated === false &&
            e.style?.stroke === "var(--border-strong)" &&
            e.style?.strokeWidth === 1 &&
            e.style?.strokeOpacity === 0.15 &&
            getMarkerColor(e.markerEnd) === markerStrong
          ) {
            return e;
          }
          changed = true;
          return {
            ...e,
            animated: false,
            style: {
              stroke: "var(--border-strong)",
              strokeWidth: 1,
              strokeOpacity: 0.15,
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: markerStrong,
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
              e.animated === false &&
              e.style?.stroke === "var(--accent-border)" &&
              e.style?.strokeWidth === 3 &&
              e.style?.strokeOpacity === 1 &&
              getMarkerColor(e.markerEnd) === markerAccent
            ) {
              return e;
            }
            changed = true;
            return {
              ...e,
              animated: false,
              style: {
                stroke: "var(--accent-border)",
                strokeWidth: 3,
                strokeOpacity: 1,
              },
              markerEnd: {
                type: MarkerType.ArrowClosed,
                color: markerAccent,
                width: 16,
                height: 16,
              },
            };
          }
          if (isIncoming) {
            if (
              e.animated === false &&
              e.style?.stroke === "var(--accent-text)" &&
              e.style?.strokeWidth === 2.5 &&
              e.style?.strokeOpacity === 1 &&
              getMarkerColor(e.markerEnd) === markerText
            ) {
              return e;
            }
            changed = true;
            return {
              ...e,
              animated: false,
              style: {
                stroke: "var(--accent-text)",
                strokeWidth: 2.5,
                strokeOpacity: 1,
              },
              markerEnd: {
                type: MarkerType.ArrowClosed,
                color: markerText,
                width: 14,
                height: 14,
              },
            };
          }
          if (
            e.animated === false &&
            e.style?.stroke === "var(--border-strong)" &&
            e.style?.strokeWidth === 1 &&
            e.style?.strokeOpacity === 0.2 &&
            getMarkerColor(e.markerEnd) === markerStrong
          ) {
            return e;
          }
          changed = true;
          return {
            ...e,
            animated: false,
            style: {
              stroke: "var(--border-strong)",
              strokeWidth: 1,
              strokeOpacity: 0.2,
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: markerStrong,
              width: 10,
              height: 10,
            },
          };
        }

        // Default idle edge state
        if (
          e.animated === false &&
          e.style?.stroke === "var(--border-strong)" &&
          e.style?.strokeWidth === 1.5 &&
          e.style?.strokeOpacity === 0.6 &&
          getMarkerColor(e.markerEnd) === markerStrong
        ) {
          return e;
        }
        changed = true;
        return {
          ...e,
          animated: false,
          style: {
            stroke: "var(--border-strong)",
            strokeWidth: 1.5,
            strokeOpacity: 0.6,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: markerStrong,
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
    theme,
    setEdges,
  ]);

  // Programmatically center camera when activeTarget updates from editor, tree, or url (AC-3, AC-4)
  useEffect(() => {
    if (!activeTarget || activeTarget.source === "canvas") {
      return;
    }

    // Look for target node in layout layoutNodes or current nodes.
    // For editor and tree navigation, prioritize the file card so the camera centers on the file being inspected.
    // For explicit symbol navigation (url or search), prioritize the symbol card if available.
    const fileTargetNode =
      layoutNodes.find((n) => n.id === activeTarget.fileId) ||
      nodesRef.current.find((n) => n.id === activeTarget.fileId);

    const symbolTargetNode = activeTarget.symbolId
      ? layoutNodes.find((n) => n.id === activeTarget.symbolId) ||
        nodesRef.current.find((n) => n.id === activeTarget.symbolId)
      : null;

    const targetNode =
      activeTarget.source === "editor" || activeTarget.source === "tree"
        ? fileTargetNode || symbolTargetNode
        : symbolTargetNode || fileTargetNode;

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

      // Check if target node is already visible inside current canvas viewport at zoom level
      if (typeof window !== "undefined" && getViewport) {
        const viewport = getViewport();
        const isZoomedIn = viewport.zoom >= 1.0;

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

        // If node is already visible and we are zoomed in, keep camera steady so flow tracking is not disrupted
        if (isZoomedIn && isVisible) {
          return;
        }
      }

      const targetKey = `editor:${targetNode.id}`;
      const currentZoom = getZoomRef.current
        ? getZoomRef.current()
        : getViewport
          ? getViewport().zoom
          : 1.0;

      if (
        currentZoom >= 1.0 &&
        lastCenteredTargetKeyRef.current === targetKey
      ) {
        return;
      }
      lastCenteredTargetKeyRef.current = targetKey;

      setCenter(centerX, centerY, { zoom: 1.2, duration: 800 });
      return;
    }

    // Explicit navigation (tree, url, search)
    const targetKey = `${activeTarget.source}:${targetNode.id}:${activeTarget.timestamp}`;
    if (lastCenteredTargetKeyRef.current === targetKey) {
      return;
    }
    lastCenteredTargetKeyRef.current = targetKey;

    setCenter(centerX, centerY, { zoom: 1.2, duration: 800 });
  }, [
    activeTarget,
    layoutNodes,
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
        className={`welcome-field relative w-full h-full overflow-auto ${className ?? ""}`}
        data-testid="architecture-canvas"
      >
        <div
          className="mx-auto flex min-h-full max-w-2xl items-center px-6 py-10 sm:px-10"
          data-testid="workspace-empty-state"
        >
          <div
            data-testid="canvas-empty-state"
            className="w-full space-y-8 text-center"
          >
            <section className="max-w-2xl">
              <svg
                viewBox="0 0 320 96"
                fill="none"
                aria-hidden="true"
                focusable="false"
                className="mx-auto mb-8 h-24 w-80 max-w-full"
              >
                <path
                  d="M88 48H128Q144 48 144 32V28Q144 20 160 20H192M144 40V68Q144 76 160 76H192"
                  stroke="var(--accent-border)"
                  strokeWidth="1.5"
                />
                <rect
                  x="1"
                  y="25"
                  width="87"
                  height="46"
                  rx="8"
                  fill="var(--accent-subtle)"
                  stroke="var(--accent-border)"
                />
                <path
                  d="m23 40-8 8 8 8m10-16 8 8-8 8"
                  stroke="var(--accent-text)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M54 43h19M54 53h12"
                  stroke="var(--accent-text)"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <rect
                  x="192"
                  y="1"
                  width="104"
                  height="38"
                  rx="8"
                  fill="var(--surface-panel)"
                  stroke="var(--border-default)"
                />
                <rect
                  x="192"
                  y="57"
                  width="104"
                  height="38"
                  rx="8"
                  fill="var(--surface-panel)"
                  stroke="var(--border-default)"
                />
                <path
                  d="M207 14h10v12h-10zM207 70h10v12h-10z"
                  stroke="var(--text-muted)"
                  strokeLinejoin="round"
                />
                <path
                  d="M229 16h50M229 24h32M229 72h50M229 80h24"
                  stroke="var(--border-strong)"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <circle cx="144" cy="48" r="3" fill="var(--accent-text)" />
              </svg>
              <p className="mb-4 text-xs font-medium text-accent-text">
                Welcome to Codebase Visualizer
              </p>
              <h2 className="mx-auto max-w-xl text-3xl font-semibold leading-tight tracking-tight text-text-primary sm:text-4xl">
                {isIngesting
                  ? "Your map is taking shape"
                  : "Understand how your code fits together."}
              </h2>
              <p className="mx-auto mt-4 max-w-lg text-sm leading-6 text-text-secondary">
                {isIngesting
                  ? "We’re exploring the repository and mapping its connections. This can take a moment."
                  : "Explore an interactive map of any public GitHub repository. Follow dependencies, inspect source files, and ask questions as you go."}
              </p>
              {!isIngesting && (
                <p className="mt-6 flex items-center justify-center gap-2 text-xs text-text-muted">
                  <ArrowUp
                    className="h-4 w-4 shrink-0 text-accent-text"
                    aria-hidden="true"
                  />
                  Paste a repository URL above to get started.
                </p>
              )}
            </section>
            {!isIngesting && (
              <section
                className="border-t border-border-subtle pt-6"
                aria-label="Example repositories"
              >
                <h3 className="text-sm font-semibold text-text-primary">
                  Explore an example
                </h3>
                <p className="mt-1 text-sm leading-6 text-text-secondary">
                  See how the workspace works with a public project.
                </p>
                <div className="welcome-examples mt-4 grid gap-3">
                  {DEMO_REPOS.map((demo) => (
                    <button
                      key={demo.name}
                      type="button"
                      onClick={() => {
                        startIngestion({ repositoryUrl: demo.repo });
                      }}
                      data-testid={`demo-repo-btn-${demo.name}`}
                      className="group flex w-full min-w-0 items-center gap-3 rounded-lg border border-border-default bg-surface-panel p-4 text-left transition-colors hover:border-accent-border hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent-subtle text-accent-text">
                        <GitBranch className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-text-primary">
                          {demo.name === "react" ? "React" : "Next.js"}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-text-muted">
                          {demo.repo}
                        </span>
                      </span>
                      <ArrowUpRight
                        className="ml-auto h-4 w-4 shrink-0 text-text-muted group-hover:text-accent-text"
                        aria-hidden="true"
                      />
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Filtered empty state when filters exclude all nodes (AC-10)
  if (layoutNodes.length === 0) {
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
            <div className="w-12 h-12 rounded-xl bg-[var(--surface-panel-secondary)] border border-[var(--border-default)] flex items-center justify-center mx-auto text-status-warning shadow-sm">
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
          "absolute top-3 z-20 pointer-events-none flex flex-col items-start gap-2",
          !isSmallScreen && isLeftCollapsed ? "left-12" : "left-3",
          !isSmallScreen && isRightCollapsed ? "right-12" : "right-3",
        )}
      >
        <div className="pointer-events-auto min-w-0 max-w-full">
          <LayerFilterBar />
        </div>

        <div className="pointer-events-auto shrink-0">
          <GraphControlsToolbar
            onZoomIn={() => {
              lastCenteredTargetKeyRef.current = null;
              zoomIn({ duration: 200 });
            }}
            onZoomOut={() => {
              lastCenteredTargetKeyRef.current = null;
              zoomOut({ duration: 200 });
            }}
            onFitView={() => {
              lastCenteredTargetKeyRef.current = null;
              fitView({ padding: 0.2, duration: 300 });
            }}
            onResetView={() => {
              lastCenteredTargetKeyRef.current = null;
              fitView({ padding: 0.2, duration: 300 });
            }}
            isMinimapVisible={isMinimapVisible}
            onToggleMinimap={() => setIsMinimapVisible(!isMinimapVisible)}
            isFollowCursorActive={isFollowCursorActive}
            onToggleFollowCursor={() =>
              setIsFollowCursorActive((prev) => !prev)
            }
            currentZoom={getZoom ? Math.round(getZoom() * 10) / 10 : 1.0}
            isCalculatingLayout={isCalculatingLayout}
          />
        </div>
      </div>

      {layoutError && (
        <div
          role="alert"
          data-testid="canvas-layout-error"
          className="absolute top-28 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-1.5 text-xs text-status-warning bg-surface-panel border border-status-warning/40 rounded-lg shadow-lg pointer-events-auto select-none"
        >
          <AlertTriangle className="w-4 h-4 text-status-warning shrink-0" />
          <span>
            Background layout calculation failed ({layoutError.message}).
            Showing previous layout.
          </span>
        </div>
      )}

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
          style: {
            stroke: "var(--border-strong)",
            strokeWidth: 1.5,
            strokeOpacity: 0.6,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: theme === "light" ? "#777086" : "#918ba8",
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
          color="var(--border-subtle)"
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
