"use client";

import React from "react";
import type { DemoPromptChip } from "@/lib/ai/demo/types";

export interface PromptChipsProps {
  readonly chips: readonly DemoPromptChip[];
  readonly variant: "empty" | "compact";
  readonly disabled: boolean;
  readonly onSelect: (chip: DemoPromptChip) => void;
}

/**
 * Renders suggested prompt chips in empty-state or compact scrollable row variants.
 */
export function PromptChips({
  chips,
  variant,
  disabled,
  onSelect,
}: PromptChipsProps): React.JSX.Element {
  if (variant === "empty") {
    return (
      <div className="pt-2 space-y-1.5 max-w-xs mx-auto text-left">
        <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
          Suggested Prompts
        </div>
        <div className="flex flex-col gap-1.5">
          {chips.map((chip) => {
            const descId = `chip-desc-${chip.id}`;
            return (
              <button
                type="button"
                key={chip.id}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!disabled) {
                    onSelect(chip);
                  }
                }}
                disabled={disabled}
                aria-describedby={descId}
                title={
                  disabled ? "Load a repository to ask questions" : undefined
                }
                className={`w-full text-left p-2 rounded-md transition-colors border text-xs cursor-pointer ${
                  disabled
                    ? "opacity-50 cursor-not-allowed bg-zinc-900/40 border-zinc-800/40 text-zinc-500"
                    : "bg-zinc-900/80 border-zinc-800/80 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800/70 hover:border-zinc-700"
                }`}
              >
                <div className="font-medium text-[11.5px] text-zinc-200">
                  {chip.label}
                </div>
                <div
                  id={descId}
                  className="text-[10px] text-zinc-500 mt-0.5 leading-snug"
                >
                  {chip.description}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Compact variant (row above input)
  return (
    <div
      role="region"
      aria-label="Suggested prompts"
      className="flex items-center gap-1.5 overflow-x-auto py-1 px-3 no-scrollbar shrink-0"
    >
      {chips.map((chip) => (
        <button
          type="button"
          key={chip.id}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!disabled) {
              onSelect(chip);
            }
          }}
          disabled={disabled}
          title={
            disabled ? "Load a repository to ask questions" : chip.description
          }
          className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors border cursor-pointer ${
            disabled
              ? "opacity-50 cursor-not-allowed bg-zinc-900 border-zinc-800 text-zinc-500"
              : "bg-zinc-900/90 border-zinc-800 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 hover:border-zinc-700"
          }`}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
