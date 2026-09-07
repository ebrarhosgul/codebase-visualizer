import {
  render,
  screen,
  fireEvent,
  act,
  waitFor,
} from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { RepoSubmissionBar } from "../repo-submission-bar";
import { useGraphStore } from "@/stores/graph-store";

describe("RepoSubmissionBar", () => {
  beforeEach(() => {
    sessionStorage.clear();
    useGraphStore.getState().reset();
    vi.restoreAllMocks();
  });

  it("renders repository input and analyze button", () => {
    render(<RepoSubmissionBar />);

    expect(
      screen.getByLabelText("Public GitHub Repository URL"),
    ).toBeInTheDocument();

    const analyzeBtn = screen.getByRole("button", {
      name: "Analyze Repository",
    });
    expect(analyzeBtn).toBeInTheDocument();
    expect(analyzeBtn).toBeDisabled();
  });

  it("enables analyze button when URL is entered", () => {
    render(<RepoSubmissionBar />);

    const input = screen.getByLabelText("Public GitHub Repository URL");
    fireEvent.change(input, { target: { value: "facebook/react" } });

    const analyzeBtn = screen.getByRole("button", {
      name: "Analyze Repository",
    });
    expect(analyzeBtn).not.toBeDisabled();
  });

  it("shows two tier progress bar and granular file counter during ingestion (AC-4)", () => {
    useGraphStore.setState({
      isIngesting: true,
      ingestionPhase: "parsing_ast",
      ingestionProgress: {
        phase: "parsing_ast",
        current: 75,
        total: 100,
        message: "Parsing TypeScript abstract syntax tree...",
        detail: {
          currentItem: 15,
          totalItems: 20,
          currentItemName: "src/utils/math.ts",
        },
      },
    });

    render(<RepoSubmissionBar />);

    expect(screen.getByTestId("ingestion-progress-bar")).toBeInTheDocument();
    expect(
      screen.getByText("Parsing TypeScript abstract syntax tree..."),
    ).toBeInTheDocument();
    expect(screen.getByTestId("ingestion-detail-counter")).toBeInTheDocument();
    expect(screen.getByText("src/utils/math.ts")).toBeInTheDocument();
    expect(screen.getByText("15 / 20 files")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cancel Ingestion" }),
    ).toBeInTheDocument();
  });

  it("displays friendly rate limit notification and trigger to open recovery dialog (AC-6)", () => {
    useGraphStore.setState({
      isIngesting: false,
      ingestionPhase: "error",
      ingestionError: {
        code: "RATE_LIMITED",
        message: "GitHub rate limit exceeded.",
        rateLimitReset: 1725300000,
      },
    });

    render(<RepoSubmissionBar />);

    expect(screen.getByTestId("ingestion-error-alert")).toBeInTheDocument();
    expect(
      screen.getByText("GitHub API Rate Limit Reached"),
    ).toBeInTheDocument();

    const openRecoveryBtn = screen.getByRole("button", {
      name: "Open Rate Limit Recovery",
    });
    expect(openRecoveryBtn).toBeInTheDocument();

    fireEvent.click(openRecoveryBtn);
    expect(useGraphStore.getState().rateLimitModalOpen).toBe(true);
  });

  it("toggles personal access token drawer and saves token via API (AC-5)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, maskedToken: "ghp_...cdef" }),
    } as unknown as Response);

    render(<RepoSubmissionBar />);

    const tokenToggleBtn = screen.getByRole("button", {
      name: "Configure GitHub Personal Access Token",
    });
    fireEvent.click(tokenToggleBtn);

    expect(screen.getByTestId("github-token-drawer")).toBeInTheDocument();

    const tokenInput = screen.getByPlaceholderText("ghp_... or github_pat_...");
    fireEvent.change(tokenInput, {
      target: { value: "ghp_12345678901234567890abcdef" },
    });

    const saveBtn = screen.getByRole("button", { name: "Save Token" });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/auth/github-token",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ token: "ghp_12345678901234567890abcdef" }),
        }),
      );
    });
  });

  it("renders force re-ingest button when repository is loaded and triggers bypass (AC-3)", () => {
    const forceSpy = vi.fn();
    useGraphStore.setState({
      repository: {
        id: "repo:facebook/react",
        owner: "facebook",
        name: "react",
        fullName: "facebook/react",
        defaultBranch: "main",
        commitSha: "sha-123",
        analyzedAt: new Date().toISOString(),
        totalFiles: 10,
        totalSymbols: 5,
        languages: {},
        schemaVersion: 1,
      },
      forceReingest: forceSpy,
    });

    render(<RepoSubmissionBar />);

    const refreshBtn = screen.getByRole("button", {
      name: "Force Re-ingest",
    });
    expect(refreshBtn).toBeInTheDocument();

    fireEvent.click(refreshBtn);
    expect(forceSpy).toHaveBeenCalled();
  });

  it("displays offline notice banner when offlineFallback is true (AC-8)", () => {
    useGraphStore.setState({
      offlineFallback: true,
      offlineLastSynced: 1725300000000,
    });

    render(<RepoSubmissionBar />);

    expect(screen.getByTestId("offline-notice-banner")).toBeInTheDocument();
    expect(screen.getByText(/Offline Mode:/i)).toBeInTheDocument();
  });

  it("displays cache hit badge on completion when isCacheHit is true (AC-1, AC-2)", () => {
    useGraphStore.setState({
      isIngesting: false,
      ingestionPhase: "complete",
      isCacheHit: true,
    });

    render(<RepoSubmissionBar />);

    expect(screen.getByTestId("ingestion-complete-banner")).toBeInTheDocument();
    expect(screen.getByTestId("cache-hit-badge")).toBeInTheDocument();
    expect(
      screen.getByText("Repository loaded from client cache in under 100ms."),
    ).toBeInTheDocument();
  });

  it("displays completion notification, allows manual dismissal, and auto-dismisses", () => {
    vi.useFakeTimers();

    useGraphStore.setState({
      isIngesting: false,
      ingestionPhase: "complete",
      isCacheHit: false,
    });

    render(<RepoSubmissionBar />);

    expect(screen.getByTestId("ingestion-complete-banner")).toBeInTheDocument();
    expect(
      screen.getByText(/Repository parsed successfully/i),
    ).toBeInTheDocument();

    // Fast-forward past 4000ms auto-dismiss timer
    act(() => {
      vi.advanceTimersByTime(4500);
    });

    expect(
      screen.queryByTestId("ingestion-complete-banner"),
    ).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  it("allows dismissing completion notification manually via close button", () => {
    useGraphStore.setState({
      isIngesting: false,
      ingestionPhase: "complete",
    });

    render(<RepoSubmissionBar />);

    expect(screen.getByTestId("ingestion-complete-banner")).toBeInTheDocument();

    const closeBtn = screen.getByRole("button", {
      name: "Dismiss completion notification",
    });
    fireEvent.click(closeBtn);

    expect(screen.queryByTestId("ingestion-complete-banner"));
  });
});
