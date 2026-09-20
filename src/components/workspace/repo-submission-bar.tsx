"use client";

import React, { useState, useEffect } from "react";
import {
  GitFork,
  GitBranch,
  Globe,
  Key,
  Play,
  XCircle,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Share2,
  Check,
  RotateCcw,
  WifiOff,
  Database,
} from "lucide-react";
import { Input, Button, Badge } from "@/components/ui";
import { useGraphStore } from "@/stores/graph-store";
import { RateLimitDialog } from "./rate-limit-dialog";
import { validateGithubTokenFormat } from "@/lib/github/token-validation";

export interface RepoSubmissionBarProps {
  readonly className?: string;
  readonly onIngestionComplete?: () => void;
}

/**
 * Workspace header bar allowing users to enter a public GitHub repository,
 * manage personal access tokens in encrypted cookies, observe two tier streaming progress,
 * and force fresh re ingestion.
 */
export function RepoSubmissionBar({
  className,
  onIngestionComplete,
}: RepoSubmissionBarProps): React.JSX.Element {
  const [url, setUrl] = useState("");
  const [branch, setBranch] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [isTokenOpen, setIsTokenOpen] = useState(false);
  const [isSavingToken, setIsSavingToken] = useState(false);

  const isIngesting = useGraphStore((state) => state.isIngesting);
  const ingestionPhase = useGraphStore((state) => state.ingestionPhase);
  const ingestionProgress = useGraphStore((state) => state.ingestionProgress);
  const ingestionError = useGraphStore((state) => state.ingestionError);
  const startIngestion = useGraphStore((state) => state.startIngestion);
  const cancelIngestion = useGraphStore((state) => state.cancelIngestion);
  const forceReingest = useGraphStore((state) => state.forceReingest);
  const repository = useGraphStore((state) => state.repository);
  const isCacheHit = useGraphStore((state) => state.isCacheHit);
  const offlineFallback = useGraphStore((state) => state.offlineFallback);
  const offlineLastSynced = useGraphStore((state) => state.offlineLastSynced);
  const hasGithubToken = useGraphStore((state) => state.hasGithubToken);
  const migrateLegacyToken = useGraphStore((state) => state.migrateLegacyToken);
  const checkTokenStatus = useGraphStore((state) => state.checkTokenStatus);
  const clearGithubToken = useGraphStore((state) => state.clearGithubToken);
  const setRateLimitModalOpen = useGraphStore(
    (state) => state.setRateLimitModalOpen,
  );

  const [copied, setCopied] = useState(false);
  const [showComplete, setShowComplete] = useState(false);

  // Migrate legacy sessionStorage token on mount (AC-5)
  useEffect(() => {
    migrateLegacyToken();
  }, [migrateLegacyToken]);

  // Auto dismiss completion notification after 4 seconds
  useEffect(() => {
    if (ingestionPhase === "complete") {
      setShowComplete(true);
      const timer = setTimeout(() => {
        setShowComplete(false);
      }, 4000);
      return () => clearTimeout(timer);
    } else {
      setShowComplete(false);
    }
  }, [ingestionPhase]);

  // Sync url and branch inputs with loaded repository
  useEffect(() => {
    if (repository?.fullName && !url) {
      setUrl(repository.fullName);
    }
    if (repository?.defaultBranch && !branch) {
      setBranch(repository.defaultBranch);
    }
  }, [repository, url, branch]);

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard errors
    }
  };

  const handleSaveToken = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }
    const clean = tokenInput.trim();
    if (!clean) {
      setTokenError("Please enter a token.");
      return;
    }

    if (!validateGithubTokenFormat(clean)) {
      setTokenError(
        "Invalid token prefix. Token must start with 'ghp_' or 'github_pat_'.",
      );
      return;
    }

    setIsSavingToken(true);
    setTokenError(null);

    try {
      const res = await fetch("/api/auth/github-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: clean }),
        credentials: "include",
      });

      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        setTokenError(err.error || "Failed to save token.");
        setIsSavingToken(false);
        return;
      }

      await checkTokenStatus();
      setTokenInput("");
      setIsSavingToken(false);
      setIsTokenOpen(false);
    } catch {
      setTokenError("Network error saving token.");
      setIsSavingToken(false);
    }
  };

  const handleClearToken = async () => {
    await clearGithubToken();
    setTokenInput("");
    setTokenError(null);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }
    if (!url.trim() || isIngesting) {
      return;
    }

    await startIngestion({
      repositoryUrl: url.trim(),
      branch: branch.trim() || undefined,
    });

    if (useGraphStore.getState().ingestionPhase === "complete") {
      onIngestionComplete?.();
    }
  };

  const handleForceRefresh = async () => {
    if (isIngesting) {
      return;
    }
    await forceReingest();
    if (useGraphStore.getState().ingestionPhase === "complete") {
      onIngestionComplete?.();
    }
  };

  return (
    <div
      className={`w-full flex flex-col gap-2 ${className ?? ""}`}
      data-testid="repo-submission-bar"
    >
      <div className="w-full flex items-center justify-between gap-3">
        {/* Logo and Brand */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-6 h-6 rounded-sm bg-surface-panel border border-border-default flex items-center justify-center">
            <GitFork className="w-3.5 h-3.5 text-text-primary" />
          </div>
          <span className="text-xs font-semibold tracking-tight text-text-primary hidden sm:inline">
            Codebase Visualizer
          </span>
        </div>

        {/* Input Controls Form */}
        <form
          onSubmit={handleSubmit}
          className="flex-1 flex items-center gap-2 max-w-2xl min-w-0"
        >
          <div className="flex-1 min-w-0">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="github.com/owner/repository"
              icon={Globe}
              disabled={isIngesting}
              aria-label="Public GitHub Repository URL"
              className="h-8 text-xs font-mono"
            />
          </div>

          <div className="w-28 shrink-0 hidden md:block">
            <Input
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="branch (opt)"
              icon={GitBranch}
              disabled={isIngesting}
              aria-label="Target Repository Branch"
              className="h-8 text-xs font-mono"
            />
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setIsTokenOpen(!isTokenOpen)}
            className={`h-8 px-2 text-xs flex items-center gap-1 ${
              hasGithubToken
                ? "text-accent-text font-medium hover:text-accent-text"
                : "text-text-secondary hover:text-text-primary"
            }`}
            title="Configure GitHub Personal Access Token"
            aria-label="Configure GitHub Personal Access Token"
            aria-expanded={isTokenOpen}
          >
            <Key className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">
              {hasGithubToken ? "Token set" : "Token"}
            </span>
          </Button>

          {isIngesting ? (
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={cancelIngestion}
              className="h-8 px-3 text-xs flex items-center gap-1.5 shrink-0"
              aria-label="Cancel Ingestion"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>Cancel</span>
            </Button>
          ) : (
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={!url.trim()}
              className="h-8 px-3 text-xs flex items-center gap-1.5 shrink-0"
              aria-label="Analyze Repository"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Analyze</span>
            </Button>
          )}

          {repository && !isIngesting && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleForceRefresh}
              className="h-8 px-2 text-xs flex items-center gap-1 text-text-secondary hover:text-text-primary shrink-0"
              title="Force re ingest repository (bypasses client cache)"
              aria-label="Force Re-ingest"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">Refresh</span>
            </Button>
          )}

          {repository && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleShare}
              className="h-8 px-2.5 text-xs flex items-center gap-1 text-text-secondary hover:text-text-primary shrink-0"
              title="Copy deep link permalink for current repository and selection"
              aria-label="Share workspace link"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-status-success" />
                  <span className="text-status-success text-xs">Copied!</span>
                </>
              ) : (
                <>
                  <Share2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline text-xs">Share</span>
                </>
              )}
            </Button>
          )}
        </form>
      </div>

      {/* Token configuration drawer / popup when opened */}
      {isTokenOpen && (
        <div
          className="p-3 rounded-md bg-surface-panel border border-border-default flex flex-col gap-2.5 text-xs animate-in fade-in-0"
          data-testid="github-token-drawer"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-medium text-text-primary">
              <Key className="w-3.5 h-3.5 text-text-secondary" />
              <span>GitHub Personal Access Token</span>
            </div>
            {hasGithubToken && (
              <Badge variant="accent" className="text-[10px]">
                Active In Cookie
              </Badge>
            )}
          </div>

          <p className="text-[11px] text-text-secondary leading-normal">
            Stored in an encrypted httpOnly cookie (`github_pat`). Increases
            your GitHub API rate limit from 60 to 5,000 requests per hour. Only
            public read permissions are needed.
          </p>

          <form onSubmit={handleSaveToken} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <Input
                  id="github-token-input"
                  type="password"
                  value={tokenInput}
                  onChange={(e) => {
                    setTokenInput(e.target.value);
                    if (tokenError) {
                      setTokenError(null);
                    }
                  }}
                  placeholder="ghp_... or github_pat_..."
                  className="h-7 text-xs font-mono"
                  disabled={isSavingToken}
                />
              </div>

              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={isSavingToken || !tokenInput.trim()}
                className="h-7 text-xs shrink-0"
              >
                {isSavingToken ? "Saving..." : "Save Token"}
              </Button>

              {hasGithubToken && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleClearToken}
                  className="h-7 text-xs text-status-error hover:text-status-error shrink-0"
                >
                  Clear
                </Button>
              )}

              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setIsTokenOpen(false)}
                className="h-7 text-xs shrink-0"
              >
                Done
              </Button>
            </div>

            {tokenError && (
              <p className="text-status-error text-[11px] flex items-center gap-1">
                <AlertCircle className="w-3 h-3 shrink-0" />
                <span>{tokenError}</span>
              </p>
            )}
          </form>
        </div>
      )}

      {/* Two Tier Streaming Progress Indicator (AC-4) */}
      {isIngesting && ingestionProgress && (
        <div
          className="px-3 py-2 rounded-md bg-surface-panel border border-border-default flex flex-col gap-1.5 text-xs"
          data-testid="ingestion-progress-bar"
        >
          {/* Tier 1: Phase and Bar */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 overflow-hidden">
              <Loader2 className="w-3.5 h-3.5 text-accent-text animate-spin shrink-0" />
              <Badge
                variant="accent"
                className="uppercase text-[10px] shrink-0 font-semibold"
              >
                {ingestionPhase.replace(/_/g, " ")}
              </Badge>
              <span className="text-[11px] text-text-primary truncate font-medium">
                {ingestionProgress.message}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] font-mono text-text-secondary">
                {Math.round(ingestionProgress.current)}%
              </span>
              <div className="w-24 h-1.5 rounded-full bg-surface-canvas border border-border-subtle overflow-hidden">
                <div
                  className="h-full bg-accent-primary-hover transition-all duration-300"
                  style={{
                    width: `${Math.min(100, Math.max(5, ingestionProgress.current))}%`,
                  }}
                />
              </div>
            </div>
          </div>

          {/* Tier 2: Detailed Item Counter / Current Module (AC-4) */}
          {ingestionProgress.detail && (
            <div
              className="flex items-center justify-between text-[10px] text-text-secondary font-mono pl-5 truncate"
              data-testid="ingestion-detail-counter"
            >
              <span className="truncate">
                {ingestionProgress.detail.currentItemName
                  ? ingestionProgress.detail.currentItemName
                  : "Processing archive contents..."}
              </span>
              {ingestionProgress.detail.totalItems ? (
                <span className="shrink-0 ml-2">
                  {ingestionProgress.detail.currentItem} /{" "}
                  {ingestionProgress.detail.totalItems} files
                </span>
              ) : (
                <span className="shrink-0 ml-2">
                  {ingestionProgress.detail.currentItem} files unpacked
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Offline Fallback Notice Banner (AC-8) */}
      {offlineFallback && (
        <div
          className="px-3 py-1.5 rounded-sm bg-status-warning/10 border border-status-warning/20 text-status-warning text-xs flex items-center justify-between gap-2"
          data-testid="offline-notice-banner"
        >
          <div className="flex items-center gap-2">
            <WifiOff className="w-3.5 h-3.5 text-status-warning shrink-0" />
            <span className="font-medium">Offline Mode:</span>
            <span className="text-[11px] text-status-warning/90">
              GitHub API unreachable. Displaying cached repository graph
              {offlineLastSynced
                ? ` (last synced ${new Date(offlineLastSynced).toLocaleString()})`
                : ""}
              .
            </span>
          </div>
          <Badge variant="warning" className="text-[10px] shrink-0">
            Offline Cache
          </Badge>
        </div>
      )}

      {/* Rate Limit and General Ingestion Error Banner (AC-6, AC-9) */}
      {ingestionPhase === "error" && ingestionError && (
        <div
          className="p-3 rounded-md bg-status-error/10 border border-status-error/20 text-status-error text-xs flex flex-col gap-2"
          data-testid="ingestion-error-alert"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-status-error shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold text-status-error">
                {ingestionError.code === "RATE_LIMITED"
                  ? "GitHub API Rate Limit Reached"
                  : "Ingestion Failed"}
              </div>
              <p className="text-[11px] text-status-error/90 mt-0.5">
                {ingestionError.message}
              </p>
              {ingestionError.rateLimitReset && (
                <p className="text-[10px] text-status-error mt-1 font-mono">
                  Rate limit resets at:{" "}
                  {new Date(
                    ingestionError.rateLimitReset * 1000,
                  ).toLocaleTimeString()}
                </p>
              )}
            </div>
          </div>

          {/* Quick trigger to open rate limit recovery modal */}
          {ingestionError.code === "RATE_LIMITED" && (
            <div className="mt-1 pt-2 border-t border-status-error/20 flex items-center justify-between gap-2">
              <span className="text-[11px] text-status-error/80">
                Supply a token or view reset countdown timer.
              </span>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => setRateLimitModalOpen(true)}
                className="h-7 text-xs shrink-0"
              >
                Open Rate Limit Recovery
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Completion Notification with Cache Hit Indicator (AC-1, AC-2) */}
      {showComplete && ingestionPhase === "complete" && (
        <div
          className="px-3 py-1.5 rounded-sm bg-status-success/10 border border-status-success/20 text-status-success text-xs flex items-center justify-between"
          data-testid="ingestion-complete-banner"
        >
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 className="w-3.5 h-3.5 text-status-success shrink-0" />
            <span className="truncate">
              {isCacheHit
                ? "Repository loaded from client cache in under 100ms."
                : "Repository parsed successfully. Click nodes to inspect source code."}
            </span>
            {isCacheHit && (
              <Badge
                variant="accent"
                className="text-[10px] bg-status-success/20 text-status-success border-status-success/30 shrink-0 flex items-center gap-1"
                data-testid="cache-hit-badge"
              >
                <Database className="w-2.5 h-2.5" />
                <span>Cache Hit</span>
              </Badge>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowComplete(false)}
            className="ml-2 p-0.5 rounded-sm hover:bg-status-success/20 text-status-success shrink-0 transition-colors"
            aria-label="Dismiss completion notification"
          >
            <XCircle className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Rate Limit Modal Dialog (AC-6) */}
      <RateLimitDialog />
    </div>
  );
}
