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
  default: "bg-surface-hover text-text-secondary border-border-default",
  success: "bg-status-success/10 text-status-success border-status-success/30",
  warning: "bg-status-warning/10 text-status-warning border-status-warning/30",
  error: "bg-status-error/10 text-status-error border-status-error/30",
  info: "bg-status-info/10 text-status-info border-status-info/30",
  accent: "bg-accent-subtle text-accent-text border-accent-border",
  "syntax-ts":
    "bg-surface-canvas text-syntax-ts border-border-subtle font-mono",
  "syntax-js":
    "bg-surface-canvas text-syntax-js border-border-subtle font-mono",
  "syntax-fn":
    "bg-surface-canvas text-syntax-fn border-border-subtle font-mono",
  "syntax-class":
    "bg-surface-canvas text-syntax-class border-border-subtle font-mono",
  "syntax-type":
    "bg-surface-canvas text-syntax-type border-border-subtle font-mono",
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
        "inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded-sm border font-medium leading-none select-none",
        VARIANT_CLASSES[variant],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
