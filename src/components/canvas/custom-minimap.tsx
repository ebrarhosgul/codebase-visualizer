"use client";

import React from "react";
import { MiniMap, type Node } from "@xyflow/react";
import { cn } from "@/lib/utils";

/**
 * Properties for the CustomMiniMap component.
 */
export interface CustomMiniMapProps {
  readonly className?: string;
  readonly zoomable?: boolean;
  readonly pannable?: boolean;
}

/**
 * Evaluates semantic minimap node color based on entity type.
 */
export function getMinimapNodeColor(node: Node): string {
  const entityType = (node.data as { entityType?: string } | undefined)
    ?.entityType;
  switch (entityType) {
    case "file":
      return "#38bdf8";
    case "symbol":
      return "#a78bfa";
    case "directory":
      return "#64748b";
    case "external":
      return "#f59e0b";
    default:
      return "#334155";
  }
}

/**
 * Accessible React Flow minimap styled to match dark slate theme.
 */
export function CustomMiniMap({
  className,
  zoomable = true,
  pannable = true,
}: CustomMiniMapProps): React.JSX.Element {
  return (
    <MiniMap
      nodeColor={getMinimapNodeColor}
      maskColor="rgba(11, 12, 14, 0.85)"
      zoomable={zoomable}
      pannable={pannable}
      ariaLabel="Overview minimap of architecture graph"
      className={cn(
        "rounded-lg overflow-hidden select-none transition-all shadow-sm",
        "!bg-[#121417] !border !border-zinc-800/60",
        className,
      )}
    />
  );
}
