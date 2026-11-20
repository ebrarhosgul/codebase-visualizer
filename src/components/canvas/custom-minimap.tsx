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
  void node;
  return "var(--border-strong)";
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
      data-testid="canvas-minimap"
      nodeColor={getMinimapNodeColor}
      maskColor="color-mix(in srgb, var(--surface-panel) 45%, transparent)"
      zoomable={zoomable}
      pannable={pannable}
      ariaLabel="Overview minimap of architecture graph"
      className={cn(
        "rounded-lg overflow-hidden select-none",
        "!bg-surface-panel !border !border-border-subtle",
        className,
      )}
    />
  );
}
