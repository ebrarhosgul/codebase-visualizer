"use client";

import React, { useEffect } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Info,
  AlertTriangle,
  X,
} from "lucide-react";

export type ToastVariant = "info" | "success" | "warning" | "error";

export interface ToastProps {
  readonly id?: string;
  readonly message: string;
  readonly variant?: ToastVariant;
  readonly durationMs?: number;
  readonly onClose: () => void;
  readonly className?: string;
}

const variantStyles: Record<
  ToastVariant,
  { container: string; icon: React.ComponentType<{ className?: string }> }
> = {
  info: {
    container: "bg-surface-panel border-accent-border text-text-primary",
    icon: Info,
  },
  success: {
    container: "bg-surface-panel border-status-success/40 text-text-primary",
    icon: CheckCircle2,
  },
  warning: {
    container: "bg-surface-panel border-status-warning/40 text-text-primary",
    icon: AlertTriangle,
  },
  error: {
    container: "bg-surface-panel border-status-error/40 text-text-primary",
    icon: AlertCircle,
  },
};

/**
 * Transient notification alert banner for user feedback and fallback messages.
 */
export function Toast({
  message,
  variant = "info",
  durationMs = 4000,
  onClose,
  className,
}: ToastProps): React.JSX.Element {
  const { container, icon: Icon } = variantStyles[variant];

  const onCloseRef = React.useRef(onClose);
  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (durationMs > 0) {
      const timer = setTimeout(() => {
        onCloseRef.current();
      }, durationMs);
      return () => clearTimeout(timer);
    }
  }, [durationMs, message]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-5 right-5 z-50 flex items-center gap-2.5 px-3 py-2 rounded-lg border shadow-xl text-xs transition-all animate-in fade-in slide-in-from-bottom-2 ${container} ${className ?? ""}`}
      data-testid="toast-notification"
    >
      <Icon className="w-4 h-4 shrink-0 text-accent-text" />
      <span className="leading-snug max-w-sm">{message}</span>
      <button
        type="button"
        onClick={onClose}
        className="ml-2 p-1 rounded-sm hover:bg-surface-active text-text-muted hover:text-text-primary transition-colors cursor-pointer"
        aria-label="Dismiss notification"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
