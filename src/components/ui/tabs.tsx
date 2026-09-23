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
          "h-9 px-1.5 bg-[#121417] border-b border-zinc-800/60 flex items-center gap-1 shrink-0",
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
              "px-2.5 py-1 text-xs font-medium rounded-md transition-colors select-none cursor-pointer",
              "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40",
              "focus-visible:outline-2 focus-visible:outline-[var(--border-focus)] focus-visible:outline-offset-1",
              "data-[state=active]:bg-zinc-800/80 data-[state=active]:text-zinc-100 data-[state=active]:border data-[state=active]:border-zinc-700/50 data-[state=active]:shadow-xs",
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
