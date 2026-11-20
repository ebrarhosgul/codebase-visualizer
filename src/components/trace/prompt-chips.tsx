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
      <div className="pt-2 space-y-2 text-left">
        <div className="text-xs font-medium text-text-muted">Try asking</div>
        <div className="flex flex-col divide-y divide-border-subtle border-y border-border-subtle">
          {chips.map((chip, index) => {
            const descId = `chip-desc-${chip.id}`;
            return (
              <button
                type="button"
                key={chip.id}
                data-testid={`prompt-chip-${index}`}
                data-chip-id={chip.id}
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
                className={`w-full text-left py-3 px-1 transition-colors text-sm ${
                  disabled
                    ? "opacity-50 cursor-not-allowed text-text-muted"
                    : "cursor-pointer text-text-secondary hover:text-text-primary hover:bg-surface-hover"
                }`}
              >
                <div className="font-medium text-sm text-text-primary">
                  {chip.label}
                </div>
                <div
                  id={descId}
                  className="text-xs text-text-muted mt-1 leading-relaxed"
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
      className="flex items-center gap-2 overflow-x-auto py-2 px-5 no-scrollbar shrink-0"
    >
      {chips.map((chip, index) => (
        <button
          type="button"
          key={chip.id}
          data-testid={`prompt-chip-compact-${index}`}
          data-chip-id={chip.id}
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
          className={`shrink-0 px-3 py-1.5 rounded-md text-xs font-medium transition-colors border ${
            disabled
              ? "opacity-50 cursor-not-allowed bg-surface-panel-secondary border-border-default text-text-muted"
              : "cursor-pointer bg-surface-card/90 border-border-default text-text-secondary hover:text-text-primary hover:bg-surface-active hover:border-border-strong"
          }`}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
