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
            <div className="absolute left-2.5 pointer-events-none text-[var(--text-muted)]">
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
              "w-full h-8 px-2.5 rounded-md text-sm text-[var(--text-primary)] bg-[var(--surface-panel)] border border-[var(--border-default)] transition-colors",
              "placeholder:text-[var(--text-muted)]",
              "focus-visible:outline-2 focus-visible:outline-[var(--border-focus)] focus-visible:outline-offset-1",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              Icon && "pl-8",
              error &&
                "border-[var(--status-error)] focus-visible:outline-[var(--status-error)]",
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
