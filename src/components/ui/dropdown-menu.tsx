"use client";

import React from "react";
import * as DropdownPrimitive from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * Item configuration for the DropdownMenu helper component.
 */
export interface DropdownMenuItemConfig {
  readonly id: string;
  readonly label: React.ReactNode;
  readonly icon?: React.ComponentType<{ className?: string }>;
  readonly shortcut?: string;
  readonly disabled?: boolean;
  readonly danger?: boolean;
  readonly onSelect?: () => void;
}

/**
 * Item or separator entry in a dropdown menu.
 */
export type DropdownMenuEntry =
  DropdownMenuItemConfig | { readonly type: "separator" };

/**
 * Properties for the DropdownMenu component.
 */
export interface DropdownMenuProps {
  readonly trigger: React.ReactNode;
  readonly items: readonly DropdownMenuEntry[];
  readonly align?: "start" | "center" | "end";
  readonly side?: "top" | "right" | "bottom" | "left";
  readonly sideOffset?: number;
  readonly className?: string;
}

/**
 * Accessible dropdown menu wrapped around Radix DropdownMenu primitives.
 */
export function DropdownMenu({
  trigger,
  items,
  align = "start",
  side = "bottom",
  sideOffset = 4,
  className,
}: DropdownMenuProps): React.JSX.Element {
  return (
    <DropdownPrimitive.Root>
      <DropdownPrimitive.Trigger asChild>{trigger}</DropdownPrimitive.Trigger>
      <DropdownPrimitive.Portal>
        <DropdownPrimitive.Content
          align={align}
          side={side}
          sideOffset={sideOffset}
          className={cn(
            "z-50 min-w-[160px] p-0.5 rounded-lg select-none",
            "bg-surface-panel-secondary border border-border-default shadow-lg",
            "animate-in fade-in-0 zoom-in-95",
            className,
          )}
        >
          {items.map((entry, index) => {
            if ("type" in entry && entry.type === "separator") {
              return (
                <DropdownPrimitive.Separator
                  key={`sep-${index}`}
                  className="h-px my-0.5 bg-border-subtle"
                />
              );
            }

            const item = entry as DropdownMenuItemConfig;
            const Icon = item.icon;

            return (
              <DropdownPrimitive.Item
                key={item.id}
                disabled={item.disabled}
                onSelect={item.onSelect}
                className={cn(
                  "flex items-center gap-2 px-2 py-1 text-xs rounded-sm font-medium cursor-pointer transition-colors outline-none",
                  "text-text-primary hover:bg-surface-active focus:bg-surface-active",
                  item.danger &&
                    "text-status-error hover:bg-status-error/10 focus:bg-status-error/10",
                  "disabled:opacity-40 disabled:pointer-events-none disabled:cursor-not-allowed",
                )}
              >
                {Icon && <Icon className="w-3.5 h-3.5 text-text-secondary" />}
                <span className="flex-1">{item.label}</span>
                {item.shortcut && (
                  <span className="text-[10px] text-text-muted font-mono ml-auto">
                    {item.shortcut}
                  </span>
                )}
              </DropdownPrimitive.Item>
            );
          })}
        </DropdownPrimitive.Content>
      </DropdownPrimitive.Portal>
    </DropdownPrimitive.Root>
  );
}

export const DropdownMenuRoot = DropdownPrimitive.Root;
export const DropdownMenuTrigger = DropdownPrimitive.Trigger;
export const DropdownMenuContent = DropdownPrimitive.Content;
export const DropdownMenuItem = DropdownPrimitive.Item;
export const DropdownMenuSeparator = DropdownPrimitive.Separator;
