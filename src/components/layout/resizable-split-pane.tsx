"use client";

import React, { useId } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { cn } from "@/lib/utils";

/**
 * Configuration for an individual panel within the split pane container.
 */
export interface PanelConfig {
  readonly id: string;
  readonly defaultSize: number;
  readonly minSize?: number;
  readonly maxSize?: number;
  readonly collapsible?: boolean;
  readonly collapsed?: boolean;
  readonly content: React.ReactNode;
  readonly ariaLabel?: string;
}

/**
 * Properties for the ResizableSplitPane component.
 */
export interface ResizableSplitPaneProps {
  readonly direction?: "horizontal" | "vertical";
  readonly panels: readonly PanelConfig[];
  readonly onResize?: (sizes: number[]) => void;
  readonly className?: string;
}

/**
 * Accessible split pane layout with keyboard navigation and focus rings.
 */
export function ResizableSplitPane({
  direction = "horizontal",
  panels,
  onResize,
  className,
}: ResizableSplitPaneProps): React.JSX.Element {
  const groupId = useId();

  if (panels.length === 0) {
    return <div className={cn("w-full h-full", className)} />;
  }

  return (
    <Group
      id={groupId}
      orientation={direction}
      className={cn("w-full h-full flex overflow-hidden", className)}
      onLayoutChanged={(layout) => {
        if (onResize) {
          const sizes = panels.map((p) => layout[p.id] ?? p.defaultSize);
          onResize(sizes);
        }
      }}
    >
      {panels.map((panel, index) => {
        const isLast = index === panels.length - 1;
        return (
          <React.Fragment key={panel.id}>
            <Panel
              id={panel.id}
              defaultSize={`${panel.defaultSize}%`}
              minSize={
                panel.minSize !== undefined ? `${panel.minSize}%` : undefined
              }
              maxSize={
                panel.maxSize !== undefined ? `${panel.maxSize}%` : undefined
              }
              collapsible={panel.collapsible}
              className="relative overflow-hidden h-full flex flex-col"
              aria-label={panel.ariaLabel}
            >
              {panel.content}
            </Panel>
            {!isLast && (
              <Separator
                id={`separator-${panel.id}`}
                aria-label={`Resize between panel ${index + 1} and panel ${index + 2}`}
                className={cn(
                  "relative flex items-center justify-center transition-colors select-none z-10",
                  direction === "horizontal"
                    ? "w-1 cursor-col-resize hover:bg-surface-active active:bg-accent-primary-hover bg-surface-hover"
                    : "h-1 cursor-row-resize hover:bg-surface-active active:bg-accent-primary-hover bg-surface-hover",
                  "focus-visible:outline-2 focus-visible:outline-[var(--border-focus)] focus-visible:outline-offset-1",
                )}
              >
                <div
                  className={cn(
                    "rounded-full bg-border-strong opacity-40 transition-opacity group-hover:opacity-100",
                    direction === "horizontal" ? "w-0.5 h-5" : "h-0.5 w-5",
                  )}
                />
              </Separator>
            )}
          </React.Fragment>
        );
      })}
    </Group>
  );
}
