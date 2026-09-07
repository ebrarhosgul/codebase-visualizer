import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RateLimitDialog } from "../rate-limit-dialog";
import { useGraphStore } from "@/stores/graph-store";

describe("RateLimitDialog", () => {
  beforeEach(() => {
    useGraphStore.getState().reset();
    vi.restoreAllMocks();
  });

  it("does not render dialog content when closed", () => {
    useGraphStore.setState({ rateLimitModalOpen: false });
    render(<RateLimitDialog />);
    expect(screen.queryByTestId("rate-limit-dialog")).not.toBeInTheDocument();
  });

  it("renders countdown timer when opened with reset timestamp (covers: AC-6)", () => {
    // Set reset timestamp 120 seconds in the future
    const futureReset = Math.floor(Date.now() / 1000) + 120;
    useGraphStore.setState({
      rateLimitModalOpen: true,
      rateLimitReset: futureReset,
    });

    render(<RateLimitDialog />);
    expect(screen.getByTestId("rate-limit-dialog")).toBeInTheDocument();

    const countdown = screen.getByTestId("rate-limit-countdown");
    expect(countdown.textContent).toMatch(/^[12]:[0-5][0-9]$/);
  });

  it("shows error when entering token with invalid prefix (covers: AC-6)", async () => {
    useGraphStore.setState({
      rateLimitModalOpen: true,
      rateLimitReset: Math.floor(Date.now() / 1000) + 300,
    });

    render(<RateLimitDialog />);

    const input = screen.getByTestId("rate-limit-token-input");
    fireEvent.change(input, {
      target: { value: "invalid_prefix_token_123456" },
    });

    const submitBtn = screen.getByTestId("rate-limit-submit-button");
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByTestId("rate-limit-token-error")).toHaveTextContent(
        "Invalid token prefix",
      );
    });
  });

  it("saves valid token and triggers ingestion retry on submit (covers: AC-5, AC-6)", async () => {
    const validToken = "ghp_12345678901234567890abcdef";
    const retrySpy = vi.fn();
    useGraphStore.setState({
      rateLimitModalOpen: true,
      rateLimitReset: Math.floor(Date.now() / 1000) + 300,
      retryAfterRateLimit: retrySpy,
    });

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/auth/github-token") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, maskedToken: "ghp_...cdef" }),
        } as unknown as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ hasToken: true }),
      } as unknown as Response);
    });

    render(<RateLimitDialog />);

    const input = screen.getByTestId("rate-limit-token-input");
    fireEvent.change(input, { target: { value: validToken } });

    const submitBtn = screen.getByTestId("rate-limit-submit-button");
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/auth/github-token",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ token: validToken }),
        }),
      );
      expect(retrySpy).toHaveBeenCalled();
    });
  });

  it("enables Retry Now button when timer is expired and triggers retry on click (covers: AC-6)", async () => {
    const retrySpy = vi.fn();
    // Set reset timestamp in the past
    useGraphStore.setState({
      rateLimitModalOpen: true,
      rateLimitReset: Math.floor(Date.now() / 1000) - 10,
      retryAfterRateLimit: retrySpy,
    });

    render(<RateLimitDialog />);

    const retryBtn = screen.getByRole("button", { name: "Retry Now" });
    expect(retryBtn).not.toBeDisabled();

    fireEvent.click(retryBtn);

    expect(useGraphStore.getState().rateLimitModalOpen).toBe(false);
    expect(retrySpy).toHaveBeenCalled();
  });

  it("shows validation error when attempting to submit empty token (covers: AC-6)", async () => {
    useGraphStore.setState({
      rateLimitModalOpen: true,
      rateLimitReset: Math.floor(Date.now() / 1000) + 300,
    });

    render(<RateLimitDialog />);

    const form = screen.getByTestId("rate-limit-token-input").closest("form");
    expect(form).not.toBeNull();
    if (form) {
      fireEvent.submit(form);
    }

    await waitFor(() => {
      expect(screen.getByTestId("rate-limit-token-error")).toHaveTextContent(
        "Please enter a GitHub Personal Access Token",
      );
    });
  });

  it("closes dialog when Cancel button is clicked", () => {
    useGraphStore.setState({
      rateLimitModalOpen: true,
      rateLimitReset: Math.floor(Date.now() / 1000) + 300,
    });

    render(<RateLimitDialog />);

    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    fireEvent.click(cancelBtn);

    expect(useGraphStore.getState().rateLimitModalOpen).toBe(false);
  });

  it("displays server error message when token storage request fails (covers: AC-5, AC-6)", async () => {
    useGraphStore.setState({
      rateLimitModalOpen: true,
      rateLimitReset: Math.floor(Date.now() / 1000) + 300,
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "Invalid token permissions on GitHub" }),
    } as unknown as Response);

    render(<RateLimitDialog />);

    const input = screen.getByTestId("rate-limit-token-input");
    fireEvent.change(input, {
      target: { value: "ghp_12345678901234567890abcdef" },
    });

    const submitBtn = screen.getByTestId("rate-limit-submit-button");
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByTestId("rate-limit-token-error")).toHaveTextContent(
        "Invalid token permissions on GitHub",
      );
    });
  });

  it("uses password input type for token security against shoulder surfing (covers: AC-5)", () => {
    useGraphStore.setState({
      rateLimitModalOpen: true,
      rateLimitReset: Math.floor(Date.now() / 1000) + 300,
    });

    render(<RateLimitDialog />);

    const input = screen.getByTestId("rate-limit-token-input");
    expect(input).toHaveAttribute("type", "password");
  });
});
