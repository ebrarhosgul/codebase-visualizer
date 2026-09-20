"use client";

import React, { useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  FileCode,
  Folder,
  Package,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import type { CodebaseReactFlowNode } from "@/graph";
import { useGraphStore } from "@/stores/graph-store";
import { cn } from "@/lib/utils";

function getFileBadgeVariant(name: string): BadgeVariant {
  if (name.endsWith(".ts") || name.endsWith(".tsx")) {
    return "syntax-ts";
  }
  if (name.endsWith(".js") || name.endsWith(".jsx")) {
    return "syntax-js";
  }
  return "default";
}

function getFileExtension(name: string): string {
  const parts = name.split(".");
  return parts.length > 1 ? `.${parts.pop()}` : "file";
}

/**
 * Custom React Flow card node representing files, directories, and external modules.
 */
export const FileNodeCard = React.memo(function FileNodeCard({
  id,
  data,
  selected,
}: NodeProps<CodebaseReactFlowNode>): React.JSX.Element {
  const [isExpanded, setIsExpanded] = useState(false);
  const isHoveredInStore = useGraphStore((state) => state.hoveredNodeId === id);
  const entityType = data.entityType;
  const label = data.label;

  let Icon = FileCode;
  let badgeLabel = "file";
  let badgeVariant: BadgeVariant = "default";
  let subtitle = "";

  if (entityType === "directory") {
    Icon = Folder;
    badgeLabel = "dir";
    badgeVariant = "default";
    subtitle = data.entity.path;
  } else if (entityType === "external") {
    Icon = Package;
    badgeLabel = "pkg";
    badgeVariant = "default";
    subtitle = "external package";
  } else if (entityType === "file") {
    Icon = FileCode;
    badgeLabel = getFileExtension(label);
    badgeVariant = getFileBadgeVariant(label);
    subtitle = data.entity.path;
  }

  const isHovered =
    isHoveredInStore || Boolean((data as Record<string, unknown>).isHovered);
  const isConnected = Boolean((data as Record<string, unknown>).isConnected);
  const isDimmed = Boolean((data as Record<string, unknown>).isDimmed);

  return (
    <div
      role="article"
      aria-label={`${entityType} node: ${label}`}
      className={cn(
        "relative rounded-lg p-3 w-[240px] max-w-[240px] select-none transition-colors duration-150 shadow-xs",
        "bg-surface-card border",
        selected
          ? "border-[var(--accent-primary)] ring-2 ring-[var(--accent-primary)]/40 z-20"
          : isHovered
            ? "border-border-strong bg-surface-card/90 z-10"
            : isConnected
              ? "border-border-strong shadow-xs"
              : "border-border-default hover:border-border-strong",
        isDimmed && !selected && !isHovered && !isConnected && "opacity-25",
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="w-2 h-2 !bg-text-secondary border border-surface-card rounded-full -left-[4px]"
      />

      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="p-1.5 rounded-md bg-surface-panel-secondary border border-border-default shrink-0 text-text-secondary">
            <Icon className="w-3.5 h-3.5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h4
              className="text-xs font-medium text-text-primary truncate"
              title={label}
            >
              {label}
            </h4>
            {subtitle && (
              <p
                className="text-[10px] text-text-muted truncate font-mono"
                title={subtitle}
              >
                {subtitle}
              </p>
            )}
          </div>
        </div>
        <Badge
          variant={badgeVariant}
          className="shrink-0 text-[10px] font-mono px-1.5 py-0.2"
        >
          {badgeLabel}
        </Badge>
      </div>

      {entityType === "file" && (
        <div className="mt-2 pt-2 border-t border-border-default">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className="flex items-center gap-1 text-[11px] text-text-secondary hover:text-text-primary focus-visible:outline-2 focus-visible:outline-[var(--border-focus)] rounded-sm cursor-pointer"
            aria-expanded={isExpanded}
          >
            {isExpanded ? (
              <ChevronDown className="w-3 h-3" aria-hidden="true" />
            ) : (
              <ChevronRight className="w-3 h-3" aria-hidden="true" />
            )}
            <span>{isExpanded ? "Hide details" : "Show details"}</span>
          </button>

          {isExpanded && (
            <div className="mt-2 text-[10px] text-text-secondary space-y-1 font-mono">
              <div className="flex justify-between">
                <span>Symbols:</span>
                <span className="text-text-primary font-medium">
                  {data.entity.symbolIds ? data.entity.symbolIds.length : 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Imports:</span>
                <span className="text-text-primary font-medium">
                  {data.entity.importIds ? data.entity.importIds.length : 0}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        className="w-2 h-2 !bg-text-secondary border border-surface-card rounded-full -right-[4px]"
      />
    </div>
  );
});
