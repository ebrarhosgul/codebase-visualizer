import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { FallbackNoticeCard } from "../fallback-notice-card";
import type { AiFallbackNotice } from "@/lib/ai/types";

describe("FallbackNoticeCard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders rate limit notice with live countdown and auto retry toggle", () => {
    const notice: AiFallbackNotice = {
      code: "rate_limit",
      title: "Rate Limit Exceeded",
      message: "Please wait before sending another query.",
      suggestedAction: "switch_demo",
      retryAfterSeconds: 10,
    };

    const onRetry = vi.fn();
    const onSwitchToDemo = vi.fn();

    render(
      <FallbackNoticeCard
        notice={notice}
        onRetry={onRetry}
        onSwitchToDemo={onSwitchToDemo}
      />,
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Rate Limit Exceeded")).toBeInTheDocument();
    expect(screen.getByText("Retry available in 10s")).toBeInTheDocument();
    expect(screen.getByText("Auto retry when ready")).toBeInTheDocument();

    // Advance timer by 5 seconds
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByText("Retry available in 5s")).toBeInTheDocument();
    expect(onRetry).not.toHaveBeenCalled();

    // Advance timer to 0 to trigger auto retry
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByText("Ready to retry")).toBeInTheDocument();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("does not auto retry when auto retry toggle is unchecked", () => {
    const notice: AiFallbackNotice = {
      code: "rate_limit",
      title: "Rate Limit Exceeded",
      message: "Please wait before sending another query.",
      suggestedAction: "switch_demo",
      retryAfterSeconds: 5,
    };

    const onRetry = vi.fn();

    render(<FallbackNoticeCard notice={notice} onRetry={onRetry} />);

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeChecked();

    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();

    act(() => {
      vi.advanceTimersByTime(6000);
    });

    expect(onRetry).not.toHaveBeenCalled();
  });

  it("renders auth error notice with Open Key Settings button and triggers callback", () => {
    const notice: AiFallbackNotice = {
      code: "auth_error",
      title: "API Key Required",
      message: "No valid credentials found.",
      suggestedAction: "open_keys",
    };

    const onOpenKeySettings = vi.fn();
    const onSwitchToDemo = vi.fn();

    render(
      <FallbackNoticeCard
        notice={notice}
        onOpenKeySettings={onOpenKeySettings}
        onSwitchToDemo={onSwitchToDemo}
      />,
    );

    expect(screen.getByText("API Key Required")).toBeInTheDocument();
    const settingsBtn = screen.getByRole("button", {
      name: /open key settings/i,
    });
    expect(settingsBtn).toBeInTheDocument();

    fireEvent.click(settingsBtn);
    expect(onOpenKeySettings).toHaveBeenCalledTimes(1);

    const demoBtn = screen.getByRole("button", {
      name: /switch to demo mode/i,
    });
    fireEvent.click(demoBtn);
    expect(onSwitchToDemo).toHaveBeenCalledTimes(1);
  });

  it("renders provider outage notice with retry and switch demo buttons", () => {
    const notice: AiFallbackNotice = {
      code: "provider_outage",
      title: "Provider Service Outage",
      message: "The AI provider is currently unreachable.",
      suggestedAction: "switch_demo",
    };

    const onRetry = vi.fn();
    const onSwitchToDemo = vi.fn();

    render(
      <FallbackNoticeCard
        notice={notice}
        onRetry={onRetry}
        onSwitchToDemo={onSwitchToDemo}
      />,
    );

    expect(screen.getByText("Provider Service Outage")).toBeInTheDocument();

    const retryBtn = screen.getByRole("button", { name: /retry now/i });
    fireEvent.click(retryBtn);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
