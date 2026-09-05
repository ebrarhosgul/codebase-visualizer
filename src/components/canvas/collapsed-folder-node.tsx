"use client";

import React from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  Folder,
  ChevronRight,
  ArrowDownLeft,
  ArrowUpRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useGraphStore } from "@/stores/graph-store";
import { getLayerDefinition } from "@/graph/layers";
import type { CollapsedFolderSummary } from "@/graph/filtering";
import { cn } from "@/lib/utils";

export interface CollapsedFolderNodeData {
  readonly label: string;
  readonly fileCount: number;
  readonly dominantLayerId: string;
  readonly externalImportCount: number;
  readonly externalExportCount: number;
  readonly entity?: CollapsedFolderSummary;
  readonly isSelected?: boolean;
  readonly [key: string]: unknown;
}

/**
 * Custom React Flow node card representing an aggregated collapsed directory.
 * Shows dominant layer badge, file count, external incoming/outgoing counters,
 * and allows expanding back to individual files via chevron button or double-click.
 */
export function CollapsedFolderNode({
  id,
  data,
  selected,
}: NodeProps): React.JSX.Element {
  const folderData = data as unknown as CollapsedFolderNodeData;
  const label = folderData.label || "folder";
  const fileCount = folderData.fileCount ?? 0;
  const externalImportCount = folderData.externalImportCount ?? 0;
  const externalExportCount = folderData.externalExportCount ?? 0;
  const dominantLayerId = (folderData.dominantLayerId ?? "other") as Parameters<
    typeof getLayerDefinition
  >[0];
  const layerDef = getLayerDefinition(dominantLayerId);

  const toggleFolderCollapse = useGraphStore(
    (state) => state.toggleFolderCollapse,
  );
  const selectNode = useGraphStore((state) => state.selectNode);

  const handleExpand = (e: React.MouseEvent): void => {
    e.stopPropagation();
    toggleFolderCollapse(label);
  };

  const handleClick = (e: React.MouseEvent): void => {
    e.stopPropagation();
    selectNode(id);
  };

  return (
    <div
      onClick={handleClick}
      onDoubleClick={handleExpand}
      className={cn(
        "group relative w-[260px] rounded-xl border p-3 select-none cursor-pointer transition-all duration-200",
        "bg-[var(--surface-panel)] backdrop-blur-md shadow-md hover:shadow-lg",
        selected
          ? "border-[var(--accent-primary)] ring-2 ring-[var(--accent-primary)]/20 shadow-xl"
          : "border-[var(--border-default)] hover:border-[var(--border-focus)]",
      )}
      data-testid={`collapsed-folder-${label}`}
      title="Click to inspect, double click to expand"
    >
      <Handle
        type="target"
        position={Position.Left}
        className="w-2 h-2 !bg-[var(--border-focus)] border-none !opacity-0 group-hover:!opacity-100 transition-opacity"
      />

      <div className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)]/60 pb-2 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <div
            className="p-1 rounded shrink-0"
            style={{
              backgroundColor: `${layerDef.color}20`,
              color: layerDef.color,
            }}
          >
            <Folder className="w-3.5 h-3.5" />
          </div>
          <span
            className="text-xs font-semibold font-mono text-[var(--text-primary)] truncate"
            title={label}
          >
            {label}
          </span>
        </div>

        <button
          type="button"
          onClick={handleExpand}
          className="p-1 rounded hover:bg-[var(--surface-canvas)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors shrink-0"
          aria-label={`Expand ${label} folder`}
          data-testid={`folder-expand-${label}`}
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex items-center justify-between gap-2 mt-1">
        <div className="flex items-center gap-1.5">
          <Badge
            variant="default"
            className="text-[9px] font-mono px-1.5 py-0.5 border"
            style={{
              borderColor: `${layerDef.color}40`,
              color: layerDef.color,
              backgroundColor: `${layerDef.color}10`,
            }}
          >
            {layerDef.label}
          </Badge>
          <span className="text-[10px] font-mono text-[var(--text-secondary)]">
            {fileCount} {fileCount === 1 ? "file" : "files"}
          </span>
        </div>

        {/* Aggregated external dependencies counters */}
        <div className="flex items-center gap-2 text-[10px] font-mono text-[var(--text-muted)]">
          {externalImportCount > 0 && (
            <span
              className="flex items-center gap-0.5 text-sky-400"
              title={`${externalImportCount} incoming external dependencies`}
            >
              <ArrowDownLeft className="w-3 h-3" />
              <span>{externalImportCount}</span>
            </span>
          )}
          {externalExportCount > 0 && (
            <span
              className="flex items-center gap-0.5 text-amber-400"
              title={`${externalExportCount} outgoing external dependencies`}
            >
              <ArrowUpRight className="w-3 h-3" />
              <span>{externalExportCount}</span>
            </span>
          )}
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="w-2 h-2 !bg-[var(--border-focus)] border-none !opacity-0 group-hover:!opacity-100 transition-opacity"
      />
    </div>
  );
}
