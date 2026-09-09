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
import { cn } from "@/lib/utils";

function getFileBadgeVariant(name: string): BadgeVariant {
  if (name.endsWith(".ts") || name.endsWith(".tsx")) {
    return "syntax-ts";
  }
  if (name.endsWith(".js") || name.endsWith(".jsx")) {
    return "syntax-js";
  }
  if (name.endsWith(".json")) {
    return "warning";
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
  data,
  selected,
}: NodeProps<CodebaseReactFlowNode>): React.JSX.Element {
  const [isExpanded, setIsExpanded] = useState(false);
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
    badgeVariant = "warning";
    subtitle = "external package";
  } else if (entityType === "file") {
    Icon = FileCode;
    badgeLabel = getFileExtension(label);
    badgeVariant = getFileBadgeVariant(label);
    subtitle = data.entity.path;
  }

  const isHovered = Boolean((data as Record<string, unknown>).isHovered);
  const isConnected = Boolean((data as Record<string, unknown>).isConnected);
  const isDimmed = Boolean((data as Record<string, unknown>).isDimmed);

  return (
    <div
      role="article"
      aria-label={`${entityType} node: ${label}`}
      className={cn(
        "relative rounded-lg p-3 min-w-[220px] max-w-[320px] select-none transition-all duration-200 shadow-md",
        "bg-[var(--surface-card)] border",
        selected || isHovered
          ? "border-[var(--accent-primary)] ring-2 ring-[var(--accent-primary)] shadow-lg shadow-[var(--accent-primary)]/20 scale-[1.02] z-20"
          : isConnected
            ? "border-[var(--border-focus)] ring-1 ring-[var(--border-focus)] shadow-sm"
            : "border-[var(--border-default)] hover:border-[var(--text-muted)]",
        isDimmed && !selected && !isHovered && !isConnected && "opacity-30",
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="w-2 h-2 bg-[var(--accent-primary)] border border-[var(--surface-card)]"
      />

      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-md bg-[var(--surface-panel-secondary)] shrink-0 text-[var(--accent-primary)]">
            <Icon className="w-4 h-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h4
              className="text-xs font-semibold text-[var(--text-primary)] truncate"
              title={label}
            >
              {label}
            </h4>
            {subtitle && (
              <p
                className="text-[10px] text-[var(--text-muted)] truncate font-mono"
                title={subtitle}
              >
                {subtitle}
              </p>
            )}
          </div>
        </div>
        <Badge variant={badgeVariant} className="shrink-0">
          {badgeLabel}
        </Badge>
      </div>

      {entityType === "file" && (
        <div className="mt-2 pt-2 border-t border-[var(--border-subtle)]">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className="flex items-center gap-1 text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-[var(--border-focus)] rounded"
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
            <div className="mt-2 text-[10px] text-[var(--text-secondary)] space-y-1 font-mono">
              <div className="flex justify-between">
                <span>Symbols:</span>
                <span className="text-[var(--text-primary)]">
                  {data.entity.symbolIds ? data.entity.symbolIds.length : 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Imports:</span>
                <span className="text-[var(--text-primary)]">
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
        className="w-2 h-2 bg-[var(--accent-primary)] border border-[var(--surface-card)]"
      />
    </div>
  );
});
