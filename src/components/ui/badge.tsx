import React from "react";
import { cn } from "@/lib/utils";

/**
 * Visual variants for semantic badges.
 */
export type BadgeVariant =
  | "default"
  | "success"
  | "warning"
  | "error"
  | "info"
  | "accent"
  | "syntax-ts"
  | "syntax-js"
  | "syntax-fn"
  | "syntax-class"
  | "syntax-type";

/**
 * Properties for the Badge component.
 */
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  readonly variant?: BadgeVariant;
  readonly children: React.ReactNode;
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  default: "bg-zinc-800/40 text-zinc-400 border-zinc-700/50",
  success: "bg-emerald-950/30 text-emerald-400 border-emerald-800/40",
  warning: "bg-amber-950/30 text-amber-400 border-amber-800/40",
  error: "bg-rose-950/30 text-rose-400 border-rose-800/40",
  info: "bg-blue-950/30 text-blue-400 border-blue-800/40",
  accent: "bg-zinc-800 text-zinc-200 border-zinc-700/70",
  "syntax-ts": "bg-zinc-900/60 text-zinc-400 border-zinc-800/80 font-mono",
  "syntax-js": "bg-zinc-900/60 text-zinc-400 border-zinc-800/80 font-mono",
  "syntax-fn": "bg-zinc-900/60 text-zinc-300 border-zinc-800/80 font-mono",
  "syntax-class": "bg-zinc-900/60 text-zinc-200 border-zinc-800/80 font-mono",
  "syntax-type": "bg-zinc-900/60 text-zinc-400 border-zinc-800/80 font-mono",
};

/**
 * Compact semantic status and syntax highlight badge.
 */
export function Badge({
  variant = "default",
  className,
  children,
  ...props
}: BadgeProps): React.JSX.Element {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded border font-medium leading-none select-none",
        VARIANT_CLASSES[variant],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
