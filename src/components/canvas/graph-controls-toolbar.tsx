"use client";

import React from "react";
import {
  ZoomIn,
  ZoomOut,
  Maximize,
  Map,
  RotateCcw,
  LocateFixed,
} from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/utils";

/**
 * Properties for the GraphControlsToolbar component.
 */
export interface GraphControlsToolbarProps {
  readonly onZoomIn: () => void;
  readonly onZoomOut: () => void;
  readonly onFitView: () => void;
  readonly isMinimapVisible: boolean;
  readonly onToggleMinimap: () => void;
  readonly onResetView?: () => void;
  readonly currentZoom?: number;
  readonly isFollowCursorActive?: boolean;
  readonly onToggleFollowCursor?: () => void;
  readonly className?: string;
}

/**
 * Floating canvas toolbar offering accessible zoom, pan, fit, and minimap toggles.
 */
export function GraphControlsToolbar({
  onZoomIn,
  onZoomOut,
  onFitView,
  isMinimapVisible,
  onToggleMinimap,
  onResetView,
  currentZoom,
  isFollowCursorActive,
  onToggleFollowCursor,
  className,
}: GraphControlsToolbarProps): React.JSX.Element {
  const formattedZoom =
    currentZoom !== undefined ? `${Math.round(currentZoom * 100)}%` : null;

  return (
    <div
      role="toolbar"
      aria-label="Canvas zoom and view controls"
      className={cn(
        "flex items-center gap-1 p-1 rounded-lg select-none shadow-lg transition-all",
        "bg-[var(--surface-panel)] border border-[var(--border-default)]",
        className,
      )}
    >
      <IconButton
        icon={ZoomIn}
        label="Zoom in"
        size="sm"
        variant="ghost"
        onClick={onZoomIn}
      />

      <IconButton
        icon={ZoomOut}
        label="Zoom out"
        size="sm"
        variant="ghost"
        onClick={onZoomOut}
      />

      {formattedZoom && (
        <span
          className="px-1.5 text-[11px] font-mono font-medium text-[var(--text-secondary)] select-none"
          aria-live="polite"
          title="Current canvas zoom"
        >
          {formattedZoom}
        </span>
      )}

      <div className="w-px h-4 bg-[var(--border-subtle)] my-auto" />

      <IconButton
        icon={Maximize}
        label="Fit entire graph in view"
        size="sm"
        variant="ghost"
        onClick={onFitView}
      />

      {onResetView && (
        <IconButton
          icon={RotateCcw}
          label="Reset view to default position"
          size="sm"
          variant="ghost"
          onClick={onResetView}
        />
      )}

      {onToggleFollowCursor && (
        <IconButton
          icon={LocateFixed}
          label={
            isFollowCursorActive
              ? "Follow code cursor (active - click to freeze canvas view)"
              : "Follow code cursor (paused - click to enable auto-pan)"
          }
          size="sm"
          variant={isFollowCursorActive ? "secondary" : "ghost"}
          onClick={onToggleFollowCursor}
          className={
            isFollowCursorActive
              ? "text-[var(--accent-primary)] border-[var(--accent-primary)]/40"
              : "text-[var(--text-muted)]"
          }
        />
      )}

      <IconButton
        icon={Map}
        label={isMinimapVisible ? "Hide minimap" : "Show minimap"}
        size="sm"
        variant={isMinimapVisible ? "secondary" : "ghost"}
        onClick={onToggleMinimap}
        className={
          isMinimapVisible
            ? "text-[var(--accent-primary)] border-[var(--accent-primary)]/40"
            : ""
        }
      />
    </div>
  );
}
