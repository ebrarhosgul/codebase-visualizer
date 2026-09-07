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
});
