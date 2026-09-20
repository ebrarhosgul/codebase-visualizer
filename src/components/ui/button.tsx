"use client";

import React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Visual variants for Button components.
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

/**
 * Density sizes for Button components.
 */
export type ButtonSize = "sm" | "md" | "lg";

/**
 * Properties for the Button component.
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly loading?: boolean;
  readonly children: React.ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-accent-primary text-accent-primary-foreground hover:bg-accent-primary-hover border border-accent-primary hover:border-accent-primary-hover",
  secondary:
    "bg-surface-panel-secondary text-text-primary border border-border-default hover:bg-surface-active hover:border-border-strong",
  ghost:
    "bg-transparent text-text-secondary border border-transparent hover:text-text-primary hover:bg-surface-hover",
  danger:
    "bg-status-error-solid text-white border border-status-error-solid hover:brightness-110",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "h-6 px-2 text-xs gap-1.5 rounded-md",
  md: "h-7 px-2.5 text-xs gap-1.5 rounded-md",
  lg: "h-8 px-3.5 text-sm gap-2 rounded-md",
};

/**
 * Accessible button component supporting semantic color tokens and loading states.
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "secondary",
      size = "md",
      loading = false,
      disabled,
      className,
      children,
      ...props
    },
    ref,
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        aria-busy={loading}
        className={cn(
          "inline-flex items-center justify-center font-medium transition-colors select-none cursor-pointer",
          "focus-visible:outline-2 focus-visible:outline-[var(--border-focus)] focus-visible:outline-offset-2",
          "disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed",
          VARIANT_CLASSES[variant],
          SIZE_CLASSES[size],
          className,
        )}
        {...props}
      >
        {loading && (
          <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
        )}
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";
