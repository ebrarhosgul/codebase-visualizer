"use client";

import React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

/**
 * Properties for the Tooltip component.
 */
export interface TooltipProps {
  readonly content: React.ReactNode;
  readonly children: React.ReactNode;
  readonly side?: "top" | "right" | "bottom" | "left";
  readonly sideOffset?: number;
  readonly delayDuration?: number;
  readonly className?: string;
}

/**
 * Accessible tooltip wrapped around Radix Tooltip primitives.
 */
export function Tooltip({
  content,
  children,
  side = "top",
  sideOffset = 4,
  delayDuration = 200,
  className,
}: TooltipProps): React.JSX.Element {
  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={sideOffset}
            className={cn(
              "z-50 px-2.5 py-1 text-xs font-medium rounded-md select-none",
              "bg-[var(--surface-panel-secondary)] text-[var(--text-primary)] border border-[var(--border-default)] shadow-md",
              "animate-in fade-in-0 zoom-in-95",
              className,
            )}
          >
            {content}
            <TooltipPrimitive.Arrow className="fill-[var(--surface-panel-secondary)]" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
