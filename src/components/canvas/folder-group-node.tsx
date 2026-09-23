"use client";

import React from "react";
import type { NodeProps } from "@xyflow/react";
import { Folder, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useGraphStore } from "@/stores/graph-store";
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
 * Offers interactive collapse button and double-click trigger to collapse folder.
 */
export const FolderGroupNode = React.memo(function FolderGroupNode({
  id,
  data,
}: NodeProps): React.JSX.Element {
  const folderData = data as unknown as FolderGroupNodeData;
  const label = folderData.label || "folder";
  const fileCount = folderData.fileCount ?? 0;
  const isActive = Boolean(
    folderData.hasActiveChild || folderData.isHighlighted,
  );
  const toggleFolderCollapse = useGraphStore(
    (state) => state.toggleFolderCollapse,
  );

  const handleCollapse = (e: React.MouseEvent): void => {
    e.stopPropagation();
    toggleFolderCollapse(label);
  };

  return (
    <div
      className={cn(
        "w-full h-full rounded-xl p-3 transition-colors duration-200 select-none pointer-events-none",
        isActive
          ? "border-2 border-border-strong bg-surface-panel-secondary/30"
          : "border border-border-subtle bg-surface-canvas/30",
      )}
      data-testid={`folder-group-${label}`}
      data-node-id={id}
      data-active={isActive}
    >
      <div
        className={cn(
          "flex items-center justify-between gap-2 border-b pb-2 mb-2 transition-colors pointer-events-auto cursor-pointer",
          isActive ? "border-border-strong" : "border-border-subtle",
        )}
        onDoubleClick={handleCollapse}
        title="Double click or click chevron to collapse folder"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            type="button"
            onClick={handleCollapse}
            className="p-1 rounded-sm hover:bg-surface-active text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
            aria-label={`Collapse ${label} folder`}
            data-testid={`folder-collapse-${label}`}
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          <div
            className={cn(
              "p-1 rounded-sm transition-colors shrink-0",
              isActive
                ? "bg-surface-active text-text-primary"
                : "bg-surface-panel-secondary text-text-secondary",
            )}
          >
            <Folder className="w-3.5 h-3.5" />
          </div>
          <span
            className={cn(
              "text-xs font-medium font-mono truncate tracking-tight transition-colors",
              isActive ? "text-text-primary" : "text-text-secondary",
            )}
            title={label}
          >
            {label}
          </span>
        </div>
        <Badge
          variant="default"
          className="text-[9px] font-mono text-text-secondary border-border-default bg-surface-panel-secondary/60 shrink-0 px-1.5 py-0.2"
        >
          {fileCount} {fileCount === 1 ? "file" : "files"}
        </Badge>
      </div>
    </div>
  );
});
