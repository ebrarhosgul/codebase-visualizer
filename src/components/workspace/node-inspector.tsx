"use client";

import React, { useMemo } from "react";
import {
  Layers,
  FileCode,
  Folder,
  Code2,
  ArrowDownLeft,
  ArrowUpRight,
  AlertTriangle,
  RotateCcw,
  Eye,
  ExternalLink,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useGraphStore } from "@/stores/graph-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { getNodeInspectionDetail } from "@/graph/inspection";
import { getLayerDefinition } from "@/graph/layers";
import { filterAndAggregateGraph } from "@/graph/filtering";
import { cn } from "@/lib/utils";

export interface NodeInspectorProps {
  readonly className?: string;
}

/**
 * Enhanced Node Inspector panel for exploring architectural module details,
 * dependency metrics, caller/callee chips with dual-action navigation, and symbol lists.
 */
export function NodeInspector({
  className,
}: NodeInspectorProps): React.JSX.Element {
  const graph = useGraphStore((state) => state.graph);
  const selectedNodeId = useGraphStore((state) => state.selectedNodeId);
  const selectedLayers = useGraphStore((state) => state.selectedLayers);
  const collapsedFolderIds = useGraphStore((state) => state.collapsedFolderIds);
  const searchQuery = useGraphStore((state) => state.searchQuery);
  const hideExternal = useGraphStore((state) => state.hideExternal);

  const navigateToTarget = useGraphStore((state) => state.navigateToTarget);
  const selectNode = useGraphStore((state) => state.selectNode);
  const revealNode = useGraphStore((state) => state.revealNode);
  const resetAllFilters = useGraphStore((state) => state.resetAllFilters);
  const setActiveRightTab = useWorkspaceStore(
    (state) => state.setActiveRightTab,
  );

  // Memoize filtered graph independently from selectedNodeId to avoid re-filtering on click
  const filteredGraph = useMemo(() => {
    if (!graph) return null;

    return filterAndAggregateGraph(graph, {
      selectedLayers,
      collapsedFolderIds,
      searchQuery,
      hideExternal,
    });
  }, [graph, selectedLayers, collapsedFolderIds, searchQuery, hideExternal]);

  // Determine if active selection is currently visible on the filtered canvas
  const isVisibleOnCanvas = useMemo(() => {
    if (!graph || !selectedNodeId || !filteredGraph) return false;

    return (
      filteredGraph.visibleFiles.some((f) => f.id === selectedNodeId) ||
      filteredGraph.collapsedFolders.some(
        (f) => f.directoryId === selectedNodeId,
      ) ||
      filteredGraph.visibleExternalModules.some(
        (e) => e.id === selectedNodeId,
      ) ||
      filteredGraph.visibleDirectories.some((d) => d.id === selectedNodeId) ||
      (selectedNodeId.startsWith("symbol:") &&
        filteredGraph.visibleFiles.some(
          (f) => f.id === graph.symbols[selectedNodeId]?.fileId,
        ))
    );
  }, [graph, selectedNodeId, filteredGraph]);

  const detail = useMemo(() => {
    return getNodeInspectionDetail(graph, selectedNodeId, isVisibleOnCanvas);
  }, [graph, selectedNodeId, isVisibleOnCanvas]);

  if (!detail) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center p-6 text-center h-full select-none text-zinc-400",
          className,
        )}
        data-testid="node-inspector-empty"
      >
        <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800/80 flex items-center justify-center text-zinc-500 mb-3">
          <Layers className="w-5 h-5" />
        </div>
        <p className="text-xs font-medium text-zinc-200">No Node Selected</p>
        <p className="text-[11px] text-zinc-500 mt-1 max-w-[220px]">
          Select any file, symbol, or directory on the canvas to inspect its
          architectural dependencies.
        </p>
      </div>
    );
  }

  const layerDef = getLayerDefinition(detail.layerId);

  const handleDualActionNavigate = (
    fileId: string,
    symbolId?: string | null,
    line?: number | null,
  ): void => {
    navigateToTarget({
      fileId,
      symbolId: symbolId ?? undefined,
      line: line ?? undefined,
      source: "search",
      timestamp: Date.now(),
    });
    setActiveRightTab("code");
  };

  return (
    <div
      className={cn(
        "p-4 text-xs space-y-4 overflow-y-auto h-full select-none",
        className,
      )}
      data-testid="node-inspector-panel"
    >
      {/* Warning banner if node is hidden by active filter (AC-9) */}
      {!detail.isVisibleOnCanvas && (
        <div
          className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200 space-y-2"
          data-testid="node-hidden-warning"
        >
          <div className="flex items-center gap-1.5 font-semibold text-[11px]">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Filtered from canvas</span>
          </div>
          <p className="text-[11px] text-amber-300/80 leading-relaxed">
            This module is hidden by current layer filters, folder collapse, or
            search.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => revealNode(detail.nodeId)}
              className="text-[11px] h-6 px-2 gap-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/30"
              data-testid="inspector-reveal-node-btn"
            >
              <Eye className="w-3 h-3" />
              <span>Reveal node</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={resetAllFilters}
              className="text-[11px] h-6 px-2 gap-1 text-amber-300 hover:text-white"
              data-testid="inspector-reset-filters-btn"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset filters</span>
            </Button>
          </div>
        </div>
      )}

      {/* Header section */}
      <div
        className="border-b border-zinc-800/60 pb-3"
        data-testid="node-inspector-header"
      >
        <div className="flex items-center justify-between gap-2">
          <Badge
            variant="default"
            className="text-[10px] font-mono px-2 py-0.5 border"
            style={{
              borderColor: `${layerDef.color}40`,
              color: layerDef.color,
              backgroundColor: `${layerDef.color}15`,
            }}
          >
            {layerDef.label}
          </Badge>

          <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
            {detail.entityType}
          </span>
        </div>

        <div className="flex items-center gap-2 mt-2">
          <div
            className="p-1.5 rounded-lg shrink-0"
            style={{
              backgroundColor: `${layerDef.color}15`,
              color: layerDef.color,
            }}
          >
            {detail.entityType === "directory" ? (
              <Folder className="w-4 h-4" />
            ) : detail.entityType === "symbol" ? (
              <Code2 className="w-4 h-4" />
            ) : (
              <FileCode className="w-4 h-4" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3
              className="text-sm font-semibold font-mono text-zinc-100 truncate"
              title={detail.displayName}
              data-testid="node-inspector-title"
            >
              {detail.displayName}
            </h3>
            <p
              className="text-[10px] font-mono text-zinc-500 truncate"
              title={detail.filePath}
              data-testid="node-inspector-filepath"
            >
              {detail.filePath}
            </p>
          </div>
        </div>
      </div>

      {/* Connectivity & Volume Metrics (AC-7) */}
      <div
        className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-[#0B0C0E] border border-zinc-800/60 font-mono text-[11px]"
        data-testid="node-inspector-metrics"
      >
        <div className="space-y-0.5">
          <span className="text-zinc-500 text-[10px]">
            Incoming Callers (Fan In)
          </span>
          <p
            className="text-sm font-semibold text-blue-400"
            data-testid="metric-fan-in"
          >
            {detail.metrics.fanIn}
          </p>
        </div>
        <div className="space-y-0.5">
          <span className="text-zinc-500 text-[10px]">
            Outgoing Dependencies (Fan Out)
          </span>
          <p
            className="text-sm font-semibold text-zinc-300"
            data-testid="metric-fan-out"
          >
            {detail.metrics.fanOut}
          </p>
        </div>
        <div className="space-y-0.5 pt-1 border-t border-zinc-800/60">
          <span className="text-zinc-500 text-[10px]">Lines</span>
          <p
            className="text-xs font-semibold text-zinc-200"
            data-testid="metric-line-count"
          >
            {detail.metrics.lineCount}
          </p>
        </div>
        <div className="space-y-0.5 pt-1 border-t border-zinc-800/60">
          <span className="text-zinc-500 text-[10px]">Symbols</span>
          <p
            className="text-xs font-semibold text-zinc-200"
            data-testid="metric-symbol-count"
          >
            {detail.metrics.symbolCount}
          </p>
        </div>
      </div>

      {/* Directory Constituent Files List (if directory) */}
      {detail.directoryDetails && (
        <div className="space-y-2">
          <div className="text-[11px] font-semibold text-zinc-200 flex items-center justify-between">
            <span>Contained Files ({detail.directoryDetails.totalFiles})</span>
            <span className="text-[10px] text-zinc-500 font-mono">
              {detail.directoryDetails.totalSymbols} symbols
            </span>
          </div>

          <div
            className="space-y-1 max-h-48 overflow-y-auto pr-1"
            data-testid="constituent-files-list"
          >
            {detail.directoryDetails.fileList.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => selectNode(f.id)}
                className="w-full flex items-center justify-between p-1.5 rounded-lg bg-[#0B0C0E] hover:bg-zinc-800/60 border border-zinc-800/60 text-left font-mono text-[11px] transition-colors cursor-pointer group"
                data-testid={`constituent-file-${f.id}`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <FileCode className="w-3 h-3 text-zinc-500 shrink-0" />
                  <span className="truncate text-zinc-400 group-hover:text-zinc-200">
                    {f.name}
                  </span>
                </div>
                <span className="text-[10px] text-zinc-500 shrink-0">
                  {f.lineCount}L
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Incoming Callers / Dependencies with Dual Action Navigation (AC-8) */}
      <div className="space-y-2">
        <div className="text-[11px] font-semibold text-zinc-200 flex items-center gap-1.5">
          <ArrowDownLeft className="w-3.5 h-3.5 text-blue-400" />
          <span>Incoming Callers ({detail.incomingDependencies.length})</span>
        </div>

        {detail.incomingDependencies.length > 0 ? (
          <div
            className="space-y-1.5 max-h-48 overflow-y-auto pr-1"
            data-testid="incoming-dependencies-list"
          >
            {detail.incomingDependencies.map((dep, idx) => (
              <button
                key={`${dep.edgeId}-${idx}`}
                type="button"
                onClick={() =>
                  handleDualActionNavigate(
                    dep.sourceFileId,
                    dep.sourceSymbolId,
                    dep.callLine,
                  )
                }
                className="w-full flex items-center justify-between gap-2 p-1.5 rounded-lg bg-[#0B0C0E] hover:bg-zinc-800/60 border border-zinc-800/60 text-left font-mono text-[11px] transition-colors cursor-pointer group"
                title="Click to center on canvas and reveal declaration in Monaco code viewer"
                data-testid={`incoming-dep-${idx}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-zinc-200 font-medium truncate flex items-center gap-1">
                    <span>{dep.sourceFileName}</span>
                    <ExternalLink className="w-2.5 h-2.5 text-zinc-500 group-hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  {dep.sourceSymbolName && (
                    <div className="text-[10px] text-blue-400 truncate">
                      {dep.sourceSymbolName}()
                    </div>
                  )}
                </div>
                <Badge
                  variant="default"
                  className="text-[9px] font-mono shrink-0"
                >
                  {dep.dependencyKind}
                  {dep.callLine != null ? ` :L${dep.callLine}` : ""}
                </Badge>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-zinc-500 italic font-mono pl-1">
            No incoming callers recorded
          </p>
        )}
      </div>

      {/* Outgoing Dependencies with Dual Action Navigation (AC-8) */}
      <div className="space-y-2">
        <div className="text-[11px] font-semibold text-zinc-200 flex items-center gap-1.5">
          <ArrowUpRight className="w-3.5 h-3.5 text-zinc-400" />
          <span>
            Outgoing Dependencies ({detail.outgoingDependencies.length})
          </span>
        </div>

        {detail.outgoingDependencies.length > 0 ? (
          <div
            className="space-y-1.5 max-h-48 overflow-y-auto pr-1"
            data-testid="outgoing-dependencies-list"
          >
            {detail.outgoingDependencies.map((dep, idx) => (
              <button
                key={`${dep.edgeId}-${idx}`}
                type="button"
                onClick={() =>
                  handleDualActionNavigate(
                    dep.targetFileId,
                    dep.targetSymbolId,
                    dep.callLine,
                  )
                }
                className="w-full flex items-center justify-between gap-2 p-1.5 rounded-lg bg-[#0B0C0E] hover:bg-zinc-800/60 border border-zinc-800/60 text-left font-mono text-[11px] transition-colors cursor-pointer group"
                title="Click to center on canvas and reveal declaration in Monaco code viewer"
                data-testid={`outgoing-dep-${idx}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-zinc-200 font-medium truncate flex items-center gap-1">
                    <span>{dep.targetFileName}</span>
                    <ExternalLink className="w-2.5 h-2.5 text-zinc-500 group-hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  {dep.targetSymbolName && (
                    <div className="text-[10px] text-zinc-400 truncate">
                      {dep.targetSymbolName}()
                    </div>
                  )}
                </div>
                <Badge
                  variant="default"
                  className="text-[9px] font-mono shrink-0"
                >
                  {dep.dependencyKind}
                  {dep.callLine != null ? ` :L${dep.callLine}` : ""}
                </Badge>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-zinc-500 italic font-mono pl-1">
            No outgoing dependencies recorded
          </p>
        )}
      </div>

      {/* Exported Symbols (AC-7) */}
      {detail.exportedSymbols.length > 0 && (
        <div className="space-y-2">
          <div className="text-[11px] font-semibold text-zinc-200 flex items-center gap-1.5">
            <Code2 className="w-3.5 h-3.5 text-zinc-400" />
            <span>Exported Symbols ({detail.exportedSymbols.length})</span>
          </div>

          <div
            className="space-y-1 max-h-40 overflow-y-auto pr-1"
            data-testid="exported-symbols-list"
          >
            {detail.exportedSymbols.map((sym) => (
              <button
                key={sym.id}
                type="button"
                onClick={() =>
                  handleDualActionNavigate(detail.nodeId, sym.id, sym.line)
                }
                className="w-full flex items-center justify-between p-1.5 rounded-lg bg-[#0B0C0E] hover:bg-zinc-800/60 border border-zinc-800/60 text-left font-mono text-[11px] transition-colors cursor-pointer group"
                data-testid={`exported-symbol-${sym.name}`}
              >
                <span className="text-zinc-300 group-hover:text-zinc-100 font-medium truncate">
                  {sym.name}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge variant="default" className="text-[9px] font-mono">
                    {sym.kind}
                  </Badge>
                  <span className="text-[10px] text-zinc-500">L{sym.line}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Internal Declarations (AC-7) */}
      {detail.internalSymbols.length > 0 && (
        <div className="space-y-2">
          <div className="text-[11px] font-semibold text-zinc-400 flex items-center gap-1.5">
            <Code2 className="w-3.5 h-3.5 text-zinc-500" />
            <span>Internal Declarations ({detail.internalSymbols.length})</span>
          </div>

          <div
            className="space-y-1 max-h-40 overflow-y-auto pr-1"
            data-testid="internal-symbols-list"
          >
            {detail.internalSymbols.map((sym) => (
              <button
                key={sym.id}
                type="button"
                onClick={() =>
                  handleDualActionNavigate(detail.nodeId, sym.id, sym.line)
                }
                className="w-full flex items-center justify-between p-1.5 rounded-lg bg-[#0B0C0E] hover:bg-zinc-800/60 border border-zinc-800/60 text-left font-mono text-[11px] transition-colors cursor-pointer group"
                data-testid={`internal-symbol-${sym.name}`}
              >
                <span className="text-zinc-500 group-hover:text-zinc-300 truncate">
                  {sym.name}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[9px] text-zinc-500">{sym.kind}</span>
                  <span className="text-[10px] text-zinc-500">L{sym.line}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
