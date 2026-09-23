"use client";

import React from "react";

export interface DemoAnswerFooterProps {
  readonly hiddenCount?: number;
  readonly isMostRecentAnswer?: boolean;
  readonly isCalculatingLayout?: boolean;
  readonly onShowAll?: () => void;
  readonly onAddKey: () => void;
}

/**
 * Renders the local heuristic attribution footer and hidden-file recovery action.
 */
export function DemoAnswerFooter({
  hiddenCount = 0,
  isMostRecentAnswer = false,
  isCalculatingLayout = false,
  onShowAll,
  onAddKey,
}: DemoAnswerFooterProps): React.JSX.Element {
  const showHiddenNotice =
    isMostRecentAnswer &&
    !isCalculatingLayout &&
    hiddenCount > 0 &&
    typeof onShowAll === "function";

  return (
    <div className="mt-3">
      {showHiddenNotice && (
        <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-sm bg-status-warning/10 border border-status-warning/20 text-status-warning text-[11px] mb-2">
          <span>
            {hiddenCount === 1
              ? "1 cited file is hidden by current filters"
              : `${hiddenCount} cited files are hidden by current filters`}
          </span>
          <button
            type="button"
            onClick={onShowAll}
            className="px-2 py-0.5 rounded-sm bg-status-warning/20 hover:bg-status-warning/30 text-status-warning font-medium text-[10.5px] transition-colors cursor-pointer shrink-0"
          >
            Show all
          </button>
        </div>
      )}

      <div className="pt-2 border-t border-border-subtle flex flex-wrap items-center justify-between gap-2 text-[10.5px] text-text-muted">
        <span>
          Computed from the loaded dependency graph, no AI model involved.
        </span>
        <button
          type="button"
          onClick={onAddKey}
          className="text-accent-text hover:text-text-primary font-medium underline underline-offset-2 transition-colors cursor-pointer"
        >
          Add your own key
        </button>
      </div>
    </div>
  );
}
