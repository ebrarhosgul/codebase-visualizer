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
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Sparkles, Network } from "lucide-react";
import { codebaseNodeTypes } from "./node-types";
import { GraphControlsToolbar } from "./graph-controls-toolbar";
import { CustomMiniMap } from "./custom-minimap";
import { toReactFlowElements } from "@/graph/adapters/react-flow-adapter";
import { computeDagreLayout } from "@/graph/layout/dagre-layout";
import { useGraphStore } from "@/stores/graph-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { CodebaseReactFlowNode } from "@/graph";

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
  const selectNode = useGraphStore((state) => state.selectNode);
  const isIngesting = useGraphStore((state) => state.isIngesting);
  const setActiveRightTab = useWorkspaceStore(
    (state) => state.setActiveRightTab,
  );

  const [isMinimapVisible, setIsMinimapVisible] = React.useState(true);
  const { fitView, zoomIn, zoomOut, getZoom, setCenter } = useReactFlow();
  const activeTarget = useGraphStore((state) => state.activeTarget);
  const navigateToTarget = useGraphStore((state) => state.navigateToTarget);

  // Compute positioned React Flow elements using pure transformation and Dagre layout
  const { initialNodes, initialEdges } = useMemo(() => {
    if (!graph || Object.keys(graph.files).length === 0) {
      return { initialNodes: [], initialEdges: [] };
    }

    const rawElements = toReactFlowElements(graph, {
      scope: {
        granularity: "files",
        includeExternal: true,
      },
      enabledEdgeKinds: ["file_import", "re_export"],
    });

    const positioned = computeDagreLayout(rawElements, {
      direction: "TB",
      nodeWidth: 240,
      nodeHeight: 80,
    });

    return {
      initialNodes: positioned.nodes as CodebaseReactFlowNode[],
      initialEdges: [...positioned.edges],
    };
  }, [graph]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const lastCenteredTargetKeyRef = React.useRef<string | null>(null);

  // Sync state whenever underlying graph is recomputed
  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);

    if (initialNodes.length > 0) {
      // Defer fitView slightly so DOM bounding boxes have settled, but skip if targeting a specific node
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

  // Sync node selection visual state
  useEffect(() => {
    setNodes((currentNodes) =>
      currentNodes.map((n) => ({
        ...n,
        selected:
          n.id === selectedNodeId ||
          (activeTarget != null &&
            (n.id === activeTarget.symbolId || n.id === activeTarget.fileId)),
      })),
    );
  }, [selectedNodeId, activeTarget, setNodes]);

  // Programmatically center camera when activeTarget updates from editor or url (AC-3, AC-4)
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

    // If source is editor cursor, avoid jitter if target node has not changed
    const targetKey =
      activeTarget.source === "editor"
        ? `editor:${targetNode.id}`
        : `${activeTarget.source}:${targetNode.id}:${activeTarget.timestamp}`;

    if (lastCenteredTargetKeyRef.current === targetKey) {
      return;
    }
    lastCenteredTargetKeyRef.current = targetKey;

    const anyNode = targetNode as unknown as {
      measured?: { width: number; height: number };
      width?: number;
      height?: number;
    };
    const nodeWidth = anyNode.measured?.width ?? anyNode.width ?? 240;
    const nodeHeight = anyNode.measured?.height ?? anyNode.height ?? 80;
    const centerX = targetNode.position.x + nodeWidth / 2;
    const centerY = targetNode.position.y + nodeHeight / 2;

    setCenter(centerX, centerY, { zoom: 1.2, duration: 800 });
  }, [activeTarget, nodes, initialNodes, setCenter]);

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
    lastCenteredTargetKeyRef.current = null;
  }, []);

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

  return (
    <div
      className={`relative w-full h-full bg-[var(--surface-canvas)] ${className ?? ""}`}
      data-testid="architecture-canvas"
    >
      {/* Floating Toolbar Controls */}
      <div className="absolute top-3 right-3 z-20">
        <GraphControlsToolbar
          onZoomIn={() => zoomIn({ duration: 200 })}
          onZoomOut={() => zoomOut({ duration: 200 })}
          onFitView={() => fitView({ padding: 0.2, duration: 300 })}
          isMinimapVisible={isMinimapVisible}
          onToggleMinimap={() => setIsMinimapVisible(!isMinimapVisible)}
          currentZoom={getZoom ? Math.round(getZoom() * 10) / 10 : 1.0}
        />
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        onMoveStart={handleMoveStart}
        nodeTypes={codebaseNodeTypes}
        minZoom={0.2}
        maxZoom={2.5}
        defaultEdgeOptions={{
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
