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
        <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] mb-2">
          <span>
            {hiddenCount === 1
              ? "1 cited file is hidden by current filters"
              : `${hiddenCount} cited files are hidden by current filters`}
          </span>
          <button
            type="button"
            onClick={onShowAll}
            className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-medium text-[10.5px] transition-colors cursor-pointer shrink-0"
          >
            Show all
          </button>
        </div>
      )}

      <div className="pt-2 border-t border-zinc-800/60 flex flex-wrap items-center justify-between gap-2 text-[10.5px] text-zinc-500">
        <span>
          Computed from the loaded dependency graph, no AI model involved.
        </span>
        <button
          type="button"
          onClick={onAddKey}
          className="text-blue-400 hover:text-blue-300 font-medium underline underline-offset-2 transition-colors cursor-pointer"
        >
          Add your own key
        </button>
      </div>
    </div>
  );
}
