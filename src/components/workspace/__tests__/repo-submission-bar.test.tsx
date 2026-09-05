import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { RepoSubmissionBar } from "../repo-submission-bar";
import { useGraphStore } from "@/stores/graph-store";

describe("RepoSubmissionBar", () => {
  beforeEach(() => {
    sessionStorage.clear();
    useGraphStore.getState().reset();
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

  it("shows progress bar and cancel button during ingestion (AC-2)", () => {
    useGraphStore.setState({
      isIngesting: true,
      ingestionPhase: "downloading_archive",
      ingestionProgress: {
        phase: "downloading_archive",
        current: 35,
        total: 100,
        message: "Downloading repository archive...",
      },
    });

    render(<RepoSubmissionBar />);

    expect(screen.getByTestId("ingestion-progress-bar")).toBeInTheDocument();
    expect(
      screen.getByText("Downloading repository archive..."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cancel Ingestion" }),
    ).toBeInTheDocument();
  });

  it("displays friendly rate limit notification and token retry input (AC-9)", () => {
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
    expect(
      screen.getByPlaceholderText(/Paste Personal Access Token/i),
    ).toBeInTheDocument();
  });

  it("toggles personal access token drawer and stores token in sessionStorage", () => {
    render(<RepoSubmissionBar />);

    const tokenToggleBtn = screen.getByRole("button", {
      name: "Configure GitHub Personal Access Token",
    });
    fireEvent.click(tokenToggleBtn);

    const tokenInput = screen.getByPlaceholderText("ghp_xxxxxxxxxxxx");
    fireEvent.change(tokenInput, { target: { value: "ghp_secret123" } });

    expect(sessionStorage.getItem("github_pat")).toBe("ghp_secret123");
  });

  it("displays completion notification, allows manual dismissal, and auto-dismisses", () => {
    vi.useFakeTimers();

    useGraphStore.setState({
      isIngesting: false,
      ingestionPhase: "complete",
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

    expect(
      screen.queryByTestId("ingestion-complete-banner"),
    ).not.toBeInTheDocument();
  });
});
