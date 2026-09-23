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
          ? "border-2 border-zinc-700 bg-zinc-900/30"
          : "border border-zinc-800/60 bg-zinc-950/30",
      )}
      data-testid={`folder-group-${label}`}
      data-node-id={id}
      data-active={isActive}
    >
      <div
        className={cn(
          "flex items-center justify-between gap-2 border-b pb-2 mb-2 transition-colors pointer-events-auto cursor-pointer",
          isActive ? "border-zinc-750" : "border-zinc-800/40",
        )}
        onDoubleClick={handleCollapse}
        title="Double click or click chevron to collapse folder"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            type="button"
            onClick={handleCollapse}
            className="p-1 rounded hover:bg-zinc-800/60 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
            aria-label={`Collapse ${label} folder`}
            data-testid={`folder-collapse-${label}`}
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          <div
            className={cn(
              "p-1 rounded transition-colors shrink-0",
              isActive
                ? "bg-zinc-800 text-zinc-200"
                : "bg-zinc-900 text-zinc-400",
            )}
          >
            <Folder className="w-3.5 h-3.5" />
          </div>
          <span
            className={cn(
              "text-xs font-medium font-mono truncate tracking-tight transition-colors",
              isActive ? "text-zinc-100" : "text-zinc-300",
            )}
            title={label}
          >
            {label}
          </span>
        </div>
        <Badge
          variant="default"
          className="text-[9px] font-mono text-zinc-400 border-zinc-800 bg-zinc-900/60 shrink-0 px-1.5 py-0.2"
        >
          {fileCount} {fileCount === 1 ? "file" : "files"}
        </Badge>
      </div>
    </div>
  );
});
