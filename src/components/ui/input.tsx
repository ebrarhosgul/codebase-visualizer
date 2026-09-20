"use client";

import React, { useId } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Properties for the Input component.
 */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  readonly label?: string;
  readonly error?: string;
  readonly helperText?: string;
  readonly icon?: LucideIcon;
}

/**
 * Accessible text input field with optional label, leading icon, and error states.
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      helperText,
      icon: Icon,
      id: customId,
      className,
      disabled,
      ...props
    },
    ref,
  ) => {
    const generatedId = useId();
    const inputId = customId ?? (label ? `input-${generatedId}` : undefined);
    const errorId = error ? `error-${generatedId}` : undefined;
    const helperId = helperText ? `helper-${generatedId}` : undefined;

    return (
      <div className="w-full flex flex-col gap-1 text-left">
        {label && (
          <label
            htmlFor={inputId}
            className="text-xs font-medium text-[var(--text-secondary)] select-none"
          >
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {Icon && (
            <div className="absolute left-2 pointer-events-none text-[var(--text-muted)]">
              <Icon className="w-4 h-4" aria-hidden="true" />
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            disabled={disabled}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : helperId}
            className={cn(
              "w-full h-7 px-2 rounded-md text-xs text-text-primary bg-surface-canvas border border-border-default hover:border-border-strong transition-colors",
              "placeholder:text-text-muted",
              "focus-visible:outline-none focus-visible:border-border-focus focus-visible:ring-1 focus-visible:ring-border-focus/40",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              Icon && "pl-7",
              error &&
                "border-status-error focus-visible:border-status-error focus-visible:ring-status-error/30",
              className,
            )}
            {...props}
          />
        </div>
        {error && (
          <span
            id={errorId}
            className="text-xs text-[var(--status-error)]"
            role="alert"
          >
            {error}
          </span>
        )}
        {!error && helperText && (
          <span id={helperId} className="text-xs text-[var(--text-muted)]">
            {helperText}
          </span>
        )}
      </div>
    );
  },
);

Input.displayName = "Input";
