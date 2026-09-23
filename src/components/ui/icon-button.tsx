"use client";

import React from "react";
import type { LucideIcon } from "lucide-react";
import { type ButtonVariant } from "./button";
import { cn } from "@/lib/utils";

/**
 * Sizes for IconButton.
 */
export type IconButtonSize = "sm" | "md";

/**
 * Properties for the IconButton component.
 */
export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly variant?: ButtonVariant;
  readonly size?: IconButtonSize;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-accent-primary text-accent-primary-foreground border border-accent-primary hover:bg-accent-primary-hover hover:border-accent-primary-hover",
  secondary:
    "bg-surface-panel-secondary text-text-primary border border-border-default hover:bg-surface-active hover:border-border-strong",
  ghost:
    "bg-transparent text-text-secondary border border-transparent hover:text-text-primary hover:bg-surface-hover",
  danger:
    "bg-status-error-solid text-white border border-status-error-solid hover:brightness-110",
};

const SIZE_CLASSES: Record<IconButtonSize, { button: string; icon: string }> = {
  sm: { button: "h-6 w-6 rounded-md", icon: "w-3.5 h-3.5" },
  md: { button: "h-7 w-7 rounded-md", icon: "w-4 h-4" },
};

/**
 * Compact icon action button with mandatory accessible name.
 */
export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      icon: Icon,
      label,
      variant = "ghost",
      size = "md",
      className,
      disabled,
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        title={label}
        disabled={disabled}
        className={cn(
          "inline-flex items-center justify-center transition-colors select-none cursor-pointer",
          "focus-visible:outline-2 focus-visible:outline-[var(--border-focus)] focus-visible:outline-offset-1",
          "disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed",
          VARIANT_CLASSES[variant],
          SIZE_CLASSES[size].button,
          className,
        )}
        {...props}
      >
        <Icon className={SIZE_CLASSES[size].icon} aria-hidden="true" />
      </button>
    );
  },
);

IconButton.displayName = "IconButton";
