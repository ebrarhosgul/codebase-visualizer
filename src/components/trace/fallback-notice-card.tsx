"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Clock,
  Key,
  ServerCrash,
  WifiOff,
  AlertCircle,
  RotateCw,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { AiFallbackNotice, AiFallbackCode } from "@/lib/ai/types";
import { cn } from "@/lib/utils";

export interface FallbackNoticeCardProps {
  readonly notice: AiFallbackNotice;
  readonly onSwitchToDemo?: () => void;
  readonly onOpenKeySettings?: () => void;
  readonly onRetry?: () => void;
  readonly isRetrying?: boolean;
  readonly className?: string;
}

const NOTICE_STYLE_MAP: Record<
  AiFallbackCode,
  {
    readonly border: string;
    readonly bg: string;
    readonly badgeVariant: "warning" | "error" | "info" | "default";
  }
> = {
  rate_limit: {
    border: "border-amber-500/20",
    bg: "bg-amber-500/5",
    badgeVariant: "warning",
  },
  auth_error: {
    border: "border-rose-500/20",
    bg: "bg-rose-500/5",
    badgeVariant: "error",
  },
  provider_outage: {
    border: "border-blue-500/20",
    bg: "bg-blue-500/5",
    badgeVariant: "info",
  },
  network_timeout: {
    border: "border-amber-500/20",
    bg: "bg-amber-500/5",
    badgeVariant: "warning",
  },
  unknown: {
    border: "border-zinc-800/80",
    bg: "bg-[#0B0C0E]",
    badgeVariant: "default",
  },
};

/**
 * Accessible fallback notice card offering classified recovery controls and countdown retries.
 */
export function FallbackNoticeCard({
  notice,
  onSwitchToDemo,
  onOpenKeySettings,
  onRetry,
  isRetrying = false,
  className,
}: FallbackNoticeCardProps): React.JSX.Element {
  const [secondsRemaining, setSecondsRemaining] = useState<number>(
    notice.retryAfterSeconds ?? 60,
  );
  const [autoRetry, setAutoRetry] = useState<boolean>(true);
  const retryTriggeredRef = useRef<boolean>(false);

  const style = NOTICE_STYLE_MAP[notice.code] ?? NOTICE_STYLE_MAP.unknown;

  // Countdown timer for rate limiting
  useEffect(() => {
    if (notice.code !== "rate_limit") return;

    const initialWait = notice.retryAfterSeconds ?? 60;
    setSecondsRemaining(initialWait);
    retryTriggeredRef.current = false;

    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [notice.code, notice.retryAfterSeconds]);

  // Auto retry trigger when countdown finishes
  useEffect(() => {
    if (
      notice.code === "rate_limit" &&
      secondsRemaining === 0 &&
      autoRetry &&
      !retryTriggeredRef.current &&
      onRetry
    ) {
      retryTriggeredRef.current = true;
      onRetry();
    }
  }, [notice.code, secondsRemaining, autoRetry, onRetry]);

  const renderIcon = () => {
    switch (notice.code) {
      case "rate_limit":
        return <Clock className="w-4 h-4 text-amber-400 shrink-0" />;
      case "auth_error":
        return <Key className="w-4 h-4 text-rose-400 shrink-0" />;
      case "provider_outage":
        return <ServerCrash className="w-4 h-4 text-sky-400 shrink-0" />;
      case "network_timeout":
        return <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />;
      case "unknown":
      default:
        return (
          <AlertCircle className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
        );
    }
  };

  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        "mt-2 p-3 rounded-lg border text-xs space-y-2.5 transition-colors",
        style.border,
        style.bg,
        className,
      )}
      data-testid="fallback-notice-card"
      data-notice-code={notice.code}
    >
      {/* Notice header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {renderIcon()}
          <span className="font-semibold text-zinc-100">{notice.title}</span>
        </div>
        <Badge
          variant={style.badgeVariant}
          className="text-[10px] h-4.5 px-1.5 uppercase font-mono"
        >
          {notice.code.replace("_", " ")}
        </Badge>
      </div>

      {/* Description message */}
      <p className="text-[11px] leading-relaxed text-zinc-400">
        {notice.message}
      </p>

      {/* Rate limit countdown and auto retry checkbox */}
      {notice.code === "rate_limit" && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 pb-1 border-t border-zinc-800/60 text-[11px]">
          <div className="flex items-center gap-1.5 text-amber-300 font-medium">
            <Clock className="w-3.5 h-3.5" />
            <span>
              {secondsRemaining > 0
                ? `Retry available in ${secondsRemaining}s`
                : "Ready to retry"}
            </span>
          </div>

          <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-zinc-500 hover:text-zinc-300">
            <input
              type="checkbox"
              checked={autoRetry}
              onChange={(e) => setAutoRetry(e.target.checked)}
              className="rounded border-zinc-800 accent-blue-500 w-3.5 h-3.5"
            />
            <span>Auto retry when ready</span>
          </label>
        </div>
      )}

      {/* Action triggers */}
      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-zinc-800/60">
        {notice.code === "auth_error" && onOpenKeySettings && (
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={onOpenKeySettings}
            className="gap-1.5"
          >
            <Key className="w-3 h-3" />
            <span>Open Key Settings</span>
          </Button>
        )}

        {onSwitchToDemo && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onSwitchToDemo}
            className="gap-1.5"
          >
            <Sparkles className="w-3 h-3 text-zinc-400" />
            <span>Switch to Demo Mode</span>
          </Button>
        )}

        {onRetry && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRetry}
            disabled={isRetrying}
            className="gap-1.5"
          >
            <RotateCw className={cn("w-3 h-3", isRetrying && "animate-spin")} />
            <span>{isRetrying ? "Retrying..." : "Retry Now"}</span>
          </Button>
        )}
      </div>
    </div>
  );
}
