"use client";

import React from "react";
import {
  ZoomIn,
  ZoomOut,
  Maximize,
  Map,
  RotateCcw,
  LocateFixed,
  Loader2,
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
  readonly isCalculatingLayout?: boolean;
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
  isCalculatingLayout,
  className,
}: GraphControlsToolbarProps): React.JSX.Element {
  const formattedZoom =
    currentZoom !== undefined ? `${Math.round(currentZoom * 100)}%` : null;

  return (
    <div
      role="toolbar"
      data-testid="graph-controls-toolbar"
      aria-label="Canvas zoom and view controls"
      className={cn(
        "flex items-center gap-1 p-1 rounded-lg select-none shadow-sm transition-all",
        "bg-surface-panel border border-border-subtle",
        className,
      )}
    >
      {isCalculatingLayout && (
        <div
          data-testid="layout-calculating-indicator"
          className="flex items-center gap-1 px-1.5 py-0.5 text-[11px] text-accent-text bg-accent-subtle border border-accent-border rounded-sm font-mono select-none"
          title="Calculating graph layout in background worker"
        >
          <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
          <span className="sr-only">Calculating layout</span>
        </div>
      )}

      <IconButton
        icon={ZoomIn}
        label="Zoom in"
        size="sm"
        variant="ghost"
        onClick={onZoomIn}
        data-testid="zoom-in-btn"
      />

      <IconButton
        icon={ZoomOut}
        label="Zoom out"
        size="sm"
        variant="ghost"
        onClick={onZoomOut}
        data-testid="zoom-out-btn"
      />

      {formattedZoom && (
        <span
          className="px-1.5 text-[11px] font-mono font-medium text-text-secondary select-none"
          aria-live="polite"
          title="Current canvas zoom"
        >
          {formattedZoom}
        </span>
      )}

      <div className="w-px h-4 bg-surface-active my-auto" />

      <IconButton
        icon={Maximize}
        label="Fit entire graph in view"
        size="sm"
        variant="ghost"
        onClick={onFitView}
        data-testid="fit-view-btn"
      />

      {onResetView && (
        <IconButton
          icon={RotateCcw}
          label="Reset view to default position"
          size="sm"
          variant="ghost"
          onClick={onResetView}
          data-testid="reset-view-btn"
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
          data-testid="toggle-follow-cursor-btn"
          className={
            isFollowCursorActive
              ? "text-accent-text border-accent-border bg-accent-subtle"
              : "text-text-muted hover:text-text-secondary"
          }
        />
      )}

      <IconButton
        icon={Map}
        label={isMinimapVisible ? "Hide minimap" : "Show minimap"}
        size="sm"
        variant={isMinimapVisible ? "secondary" : "ghost"}
        onClick={onToggleMinimap}
        data-testid="toggle-minimap-btn"
        className={
          isMinimapVisible
            ? "text-accent-text border-accent-border bg-accent-subtle"
            : "text-text-secondary hover:text-text-primary"
        }
      />
    </div>
  );
}
