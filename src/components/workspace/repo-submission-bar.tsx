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
} from "lucide-react";
import { Input, Button, Badge } from "@/components/ui";
import { useGraphStore } from "@/stores/graph-store";

const TOKEN_STORAGE_KEY = "github_pat";

export interface RepoSubmissionBarProps {
  readonly className?: string;
  readonly onIngestionComplete?: () => void;
}

/**
 * Workspace header bar allowing users to enter a public GitHub repository,
 * optional branch, personal access token, and observe streaming ingestion progress.
 */
export function RepoSubmissionBar({
  className,
  onIngestionComplete,
}: RepoSubmissionBarProps): React.JSX.Element {
  const [url, setUrl] = useState("");
  const [branch, setBranch] = useState("");
  const [token, setToken] = useState("");
  const [isTokenOpen, setIsTokenOpen] = useState(false);

  const isIngesting = useGraphStore((state) => state.isIngesting);
  const ingestionPhase = useGraphStore((state) => state.ingestionPhase);
  const ingestionProgress = useGraphStore((state) => state.ingestionProgress);
  const ingestionError = useGraphStore((state) => state.ingestionError);
  const startIngestion = useGraphStore((state) => state.startIngestion);
  const cancelIngestion = useGraphStore((state) => state.cancelIngestion);
  const repository = useGraphStore((state) => state.repository);

  const [copied, setCopied] = useState(false);
  const [showComplete, setShowComplete] = useState(false);

  // Auto-dismiss completion notification after 4 seconds
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

  // Load token from sessionStorage on mount
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(TOKEN_STORAGE_KEY);
      if (stored) {
        setToken(stored);
      }
    } catch {
      // Ignore sessionStorage access errors
    }
  }, []);

  // Save token to sessionStorage when changed
  const handleTokenChange = (val: string) => {
    setToken(val);
    try {
      if (val.trim()) {
        sessionStorage.setItem(TOKEN_STORAGE_KEY, val.trim());
      } else {
        sessionStorage.removeItem(TOKEN_STORAGE_KEY);
      }
    } catch {
      // Ignore sessionStorage access errors
    }
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
      githubToken: token.trim() || undefined,
    });

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
          <div className="w-6 h-6 rounded bg-[var(--surface-panel-secondary)] border border-[var(--border-subtle)] flex items-center justify-center">
            <GitFork className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
          </div>
          <span className="text-xs font-bold tracking-tight text-[var(--text-primary)] hidden sm:inline">
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
            className={`h-8 px-2 text-xs flex items-center gap-1 ${token ? "text-[var(--accent-primary)]" : "text-[var(--text-muted)]"}`}
            title="Configure GitHub Personal Access Token"
            aria-label="Configure GitHub Personal Access Token"
            aria-expanded={isTokenOpen}
          >
            <Key className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">
              {token ? "Token set" : "Token"}
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

          {repository && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleShare}
              className="h-8 px-2.5 text-xs flex items-center gap-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] shrink-0"
              title="Copy deep link permalink for current repository and selection"
              aria-label="Share workspace link"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 text-xs">Copied!</span>
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
        <div className="p-2.5 rounded-md bg-[var(--surface-panel-secondary)] border border-[var(--border-default)] flex items-center justify-between gap-3 text-xs">
          <div className="flex-1 min-w-0">
            <label
              htmlFor="github-token-input"
              className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1"
            >
              GitHub Personal Access Token (stored in browser session only)
            </label>
            <Input
              id="github-token-input"
              type="password"
              value={token}
              onChange={(e) => handleTokenChange(e.target.value)}
              placeholder="ghp_xxxxxxxxxxxx"
              className="h-7 text-xs font-mono"
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setIsTokenOpen(false)}
            className="h-7 text-xs self-end"
          >
            Done
          </Button>
        </div>
      )}

      {/* Streaming Progress Indicator */}
      {isIngesting && ingestionProgress && (
        <div
          className="px-3 py-1.5 rounded bg-[var(--surface-panel-secondary)] border border-[var(--border-subtle)] flex items-center justify-between gap-2 text-xs"
          data-testid="ingestion-progress-bar"
        >
          <div className="flex items-center gap-2 overflow-hidden">
            <Loader2 className="w-3.5 h-3.5 text-[var(--accent-primary)] animate-spin shrink-0" />
            <Badge variant="accent" className="uppercase text-[10px] shrink-0">
              {ingestionPhase.replace(/_/g, " ")}
            </Badge>
            <span className="text-[11px] text-[var(--text-secondary)] truncate">
              {ingestionProgress.message}
            </span>
          </div>

          <div className="w-24 h-1.5 rounded-full bg-[var(--surface-canvas)] overflow-hidden shrink-0">
            <div
              className="h-full bg-[var(--accent-primary)] transition-all duration-300"
              style={{
                width: `${Math.min(100, Math.max(5, ingestionProgress.current))}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Rate Limit and General Ingestion Error Banner (AC-9) */}
      {ingestionPhase === "error" && ingestionError && (
        <div
          className="p-3 rounded-md bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex flex-col gap-2"
          data-testid="ingestion-error-alert"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold text-rose-200">
                {ingestionError.code === "RATE_LIMITED"
                  ? "GitHub API Rate Limit Reached"
                  : "Ingestion Failed"}
              </div>
              <p className="text-[11px] text-rose-300/90 mt-0.5">
                {ingestionError.message}
              </p>
              {ingestionError.rateLimitReset && (
                <p className="text-[10px] text-rose-400 mt-1 font-mono">
                  Rate limit resets at:{" "}
                  {new Date(
                    ingestionError.rateLimitReset * 1000,
                  ).toLocaleTimeString()}
                </p>
              )}
            </div>
          </div>

          {/* Quick inline token entry if rate limited */}
          {ingestionError.code === "RATE_LIMITED" && (
            <div className="mt-1 pt-2 border-t border-rose-500/20 flex items-center gap-2">
              <Input
                type="password"
                placeholder="Paste Personal Access Token to retry..."
                value={token}
                onChange={(e) => handleTokenChange(e.target.value)}
                className="h-7 text-xs font-mono flex-1 bg-black/40 border-rose-500/30 text-rose-100"
              />
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => handleSubmit()}
                className="h-7 text-xs shrink-0"
              >
                Retry
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Completion Notification */}
      {showComplete && ingestionPhase === "complete" && (
        <div
          className="px-3 py-1.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between"
          data-testid="ingestion-complete-banner"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="truncate">
              Repository parsed successfully. Click nodes to inspect source
              code.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowComplete(false)}
            className="ml-2 p-0.5 rounded hover:bg-emerald-500/20 text-emerald-300 shrink-0 transition-colors"
            aria-label="Dismiss completion notification"
          >
            <XCircle className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
