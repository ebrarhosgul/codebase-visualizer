"use client";

import React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

/**
 * Item descriptor for the convenient Tabs component.
 */
export interface TabItem {
  readonly value: string;
  readonly label: React.ReactNode;
  readonly content?: React.ReactNode;
  readonly disabled?: boolean;
}

/**
 * Properties for the convenience Tabs component.
 */
export interface TabsProps {
  readonly value: string;
  readonly onValueChange: (val: string) => void;
  readonly items: readonly TabItem[];
  readonly className?: string;
  readonly listClassName?: string;
  readonly "data-testid"?: string;
}

/**
 * Accessible tab strip wrapped around Radix Tabs primitives.
 */
export function Tabs({
  value,
  onValueChange,
  items,
  className,
  listClassName,
  "data-testid": dataTestId,
}: TabsProps): React.JSX.Element {
  return (
    <TabsPrimitive.Root
      value={value}
      onValueChange={onValueChange}
      data-testid={dataTestId}
      className={cn("w-full h-full flex-1 min-h-0 flex flex-col", className)}
    >
      <TabsPrimitive.List
        className={cn(
          "h-8 px-1.5 bg-surface-panel border-b border-border-subtle flex items-center gap-0.5 shrink-0",
          listClassName,
        )}
      >
        {items.map((tab) => (
          <TabsPrimitive.Trigger
            key={tab.value}
            value={tab.value}
            disabled={tab.disabled}
            data-testid={`tab-trigger-${tab.value}`}
            className={cn(
              "px-2 h-6 text-xs font-medium rounded-md border border-transparent transition-colors select-none cursor-pointer",
              "text-text-secondary hover:text-text-primary hover:bg-surface-hover",
              "focus-visible:outline-2 focus-visible:outline-[var(--border-focus)] focus-visible:outline-offset-1",
              "data-[state=active]:bg-surface-active data-[state=active]:text-text-primary data-[state=active]:border-border-default",
              "disabled:opacity-40 disabled:cursor-not-allowed",
            )}
          >
            {tab.label}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {items.map((tab) =>
        tab.content !== undefined ? (
          <TabsPrimitive.Content
            key={tab.value}
            value={tab.value}
            data-testid={`tab-content-${tab.value}`}
            className="w-full flex-1 min-h-0 h-full flex flex-col overflow-hidden focus-visible:outline-none data-[state=inactive]:hidden"
          >
            {tab.content}
          </TabsPrimitive.Content>
        ) : null,
      )}
    </TabsPrimitive.Root>
  );
}

export const TabsRoot = TabsPrimitive.Root;
export const TabsList = TabsPrimitive.List;
export const TabsTrigger = TabsPrimitive.Trigger;
export const TabsContent = TabsPrimitive.Content;
