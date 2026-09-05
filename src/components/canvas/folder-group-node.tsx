"use client";

import React from "react";
import type { NodeProps } from "@xyflow/react";
import { Folder } from "lucide-react";
import { Badge } from "@/components/ui/badge";

import { cn } from "@/lib/utils";

export interface FolderGroupNodeData {
  readonly label: string;
  readonly fileCount: number;
  readonly hasActiveChild?: boolean;
  readonly isHighlighted?: boolean;
  readonly [key: string]: unknown;
}

/**
 * Custom React Flow background container node representing a directory cluster.
 * Rendered behind file cards to visually structure architectural layers.
 * Highlights when an enclosed file is selected, hovered, or active in editor.
 */
export function FolderGroupNode({ data }: NodeProps): React.JSX.Element {
  const folderData = data as unknown as FolderGroupNodeData;
  const label = folderData.label || "folder";
  const fileCount = folderData.fileCount ?? 0;
  const isActive = Boolean(
    folderData.hasActiveChild || folderData.isHighlighted,
  );

  return (
    <div
      className={cn(
        "w-full h-full rounded-2xl p-3 transition-all duration-300 select-none pointer-events-none",
        isActive
          ? "border-2 border-[var(--accent-primary)]/80 bg-[var(--accent-primary)]/8 shadow-xl shadow-[var(--accent-primary)]/15"
          : "border border-[var(--border-subtle)]/80 bg-[var(--surface-panel)]/30 backdrop-blur-xs",
      )}
      data-testid={`folder-group-${label}`}
    >
      <div
        className={cn(
          "flex items-center justify-between gap-2 border-b pb-2 mb-2 transition-colors",
          isActive
            ? "border-[var(--accent-primary)]/40"
            : "border-[var(--border-subtle)]/40",
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={cn(
              "p-1 rounded transition-colors shrink-0",
              isActive
                ? "bg-[var(--accent-primary)]/25 text-[var(--accent-primary)]"
                : "bg-[var(--surface-panel-secondary)] text-[var(--accent-primary)] opacity-80",
            )}
          >
            <Folder className="w-3.5 h-3.5" />
          </div>
          <span
            className={cn(
              "text-xs font-semibold font-mono truncate tracking-tight transition-colors",
              isActive
                ? "text-[var(--text-primary)] font-bold drop-shadow-xs"
                : "text-[var(--text-primary)]",
            )}
            title={label}
          >
            {label}
          </span>
        </div>
        <Badge
          variant={isActive ? "accent" : "default"}
          className={cn(
            "text-[9px] font-mono shrink-0 transition-colors",
            isActive && "border-[var(--accent-primary)] font-semibold",
          )}
        >
          {fileCount} {fileCount === 1 ? "file" : "files"}
        </Badge>
      </div>
    </div>
  );
}
