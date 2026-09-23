"use client";

import React, { useState, useEffect } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Clock, Key, ShieldCheck, Loader2 } from "lucide-react";
import { useGraphStore } from "@/stores/graph-store";
import { validateGithubTokenFormat } from "@/lib/github/token-validation";

export interface RateLimitDialogProps {
  readonly className?: string;
}

/**
 * Accessible modal dialog displayed when GitHub rate limits are reached.
 * Features live countdown timer, token prefix validation, and automatic ingestion retry.
 */
export function RateLimitDialog({
  className,
}: RateLimitDialogProps): React.JSX.Element {
  const isOpen = useGraphStore((state) => state.rateLimitModalOpen);
  const setOpen = useGraphStore((state) => state.setRateLimitModalOpen);
  const resetTimestamp = useGraphStore((state) => state.rateLimitReset);
  const retryAfterRateLimit = useGraphStore(
    (state) => state.retryAfterRateLimit,
  );
  const checkTokenStatus = useGraphStore((state) => state.checkTokenStatus);

  const [token, setToken] = useState("");
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(0);

  // Calculate and update countdown seconds until reset time
  useEffect(() => {
    if (!isOpen || !resetTimestamp) {
      setSecondsRemaining(0);
      return;
    }

    const calculateRemaining = () => {
      const now = Math.floor(Date.now() / 1000);
      const diff = Math.max(0, resetTimestamp - now);
      return diff;
    };

    setSecondsRemaining(calculateRemaining());

    const timer = setInterval(() => {
      const remaining = calculateRemaining();
      setSecondsRemaining(remaining);
      if (remaining <= 0) {
        clearInterval(timer);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, resetTimestamp]);

  const formatCountdown = (totalSeconds: number): string => {
    if (totalSeconds <= 0) {
      return "Ready to retry";
    }
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const handleSaveAndRetry = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }

    const trimmed = token.trim();
    if (!trimmed) {
      setTokenError("Please enter a GitHub Personal Access Token.");
      return;
    }

    if (!validateGithubTokenFormat(trimmed)) {
      setTokenError(
        "Invalid token prefix. Token must start with 'ghp_' or 'github_pat_'.",
      );
      return;
    }

    setIsSubmitting(true);
    setTokenError(null);

    try {
      const res = await fetch("/api/auth/github-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: trimmed }),
        credentials: "include",
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setTokenError(data.error || "Failed to store personal access token.");
        setIsSubmitting(false);
        return;
      }

      await checkTokenStatus();
      setToken("");
      setIsSubmitting(false);
      setOpen(false);

      // Auto retry ingestion immediately
      await retryAfterRateLimit();
    } catch {
      setTokenError("Network error storing personal access token.");
      setIsSubmitting(false);
    }
  };

  const handleWaitRetry = async () => {
    setOpen(false);
    await retryAfterRateLimit();
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={setOpen}
      title="GitHub Rate Limit Exceeded"
      description="GitHub public API request quota has been temporarily reached."
      className={className}
      data-testid="rate-limit-dialog"
    >
      <div
        className="flex flex-col gap-4 text-xs"
        data-testid="rate-limit-dialog-content"
      >
        {/* Countdown display banner */}
        <div className="p-3 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="font-medium">Automatic reset countdown:</span>
          </div>
          <span
            className="font-mono text-sm font-bold text-amber-300"
            data-testid="rate-limit-countdown"
          >
            {formatCountdown(secondsRemaining)}
          </span>
        </div>

        {/* Security & permissions explanation */}
        <div className="flex items-start gap-2.5 p-3 rounded-md bg-[var(--surface-panel-secondary)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            Unauthenticated requests share a public quota of 60 requests per
            hour. Supplying a Personal Access Token increases your limit to
            5,000 requests per hour. Only public read permissions are needed.
            Your token is encrypted server side in an httpOnly cookie and never
            exposed to client scripts.
          </p>
        </div>

        {/* Token input form */}
        <form onSubmit={handleSaveAndRetry} className="flex flex-col gap-3">
          <div>
            <label
              htmlFor="rate-limit-token-input"
              className="block text-[11px] font-medium text-[var(--text-primary)] mb-1"
            >
              Enter Personal Access Token (classic or fine grained)
            </label>
            <Input
              id="rate-limit-token-input"
              type="password"
              value={token}
              onChange={(e) => {
                setToken(e.target.value);
                if (tokenError) {
                  setTokenError(null);
                }
              }}
              placeholder="ghp_... or github_pat_..."
              icon={Key}
              disabled={isSubmitting}
              className="font-mono text-xs"
              data-testid="rate-limit-token-input"
            />
            {tokenError && (
              <p
                className="text-rose-400 text-[11px] mt-1.5 flex items-center gap-1"
                data-testid="rate-limit-token-error"
              >
                <AlertTriangle className="w-3 h-3 shrink-0" />
                <span>{tokenError}</span>
              </p>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--border-subtle)]">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={secondsRemaining > 0}
              onClick={handleWaitRetry}
              data-testid="rate-limit-retry-btn"
              title={
                secondsRemaining > 0
                  ? "Wait for reset timer to expire before retrying"
                  : "Retry failed ingestion now"
              }
            >
              {secondsRemaining > 0 ? "Wait For Reset" : "Retry Now"}
            </Button>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setOpen(false)}
                data-testid="rate-limit-cancel-btn"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={isSubmitting || !token.trim()}
                data-testid="rate-limit-confirm-btn"
                className="flex items-center gap-1.5"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Save Token & Retry</span>
                )}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </Dialog>
  );
}
