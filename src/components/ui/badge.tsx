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
  default:
    "bg-[var(--surface-panel-secondary)] text-[var(--text-secondary)] border-[var(--border-default)]",
  success: "bg-emerald-950/40 text-emerald-300 border-emerald-800/50",
  warning: "bg-amber-950/40 text-amber-300 border-amber-800/50",
  error: "bg-rose-950/40 text-rose-300 border-rose-800/50",
  info: "bg-sky-950/40 text-sky-300 border-sky-800/50",
  accent:
    "bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] border-[var(--accent-primary)]/30",
  "syntax-ts":
    "bg-sky-950/50 text-[var(--syntax-ts)] border-sky-800/60 font-mono",
  "syntax-js":
    "bg-amber-950/50 text-[var(--syntax-js)] border-amber-800/60 font-mono",
  "syntax-fn":
    "bg-purple-950/50 text-[var(--syntax-fn)] border-purple-800/60 font-mono",
  "syntax-class":
    "bg-emerald-950/50 text-[var(--syntax-class)] border-emerald-800/60 font-mono",
  "syntax-type":
    "bg-pink-950/50 text-[var(--syntax-type)] border-pink-800/60 font-mono",
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
