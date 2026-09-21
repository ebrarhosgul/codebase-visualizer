import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  checkIngestRateLimit,
  checkRateLimit,
  resetRateLimits,
} from "../rate-limiter";

// covers: AC-1, AC-3
describe("checkRateLimit", () => {
  beforeEach(() => {
    resetRateLimits();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("permits requests up to ten in demo mode (covers: AC-2)", () => {
    const ip = "192.168.1.1";
    for (let i = 0; i < 10; i++) {
      const result = checkRateLimit(ip, true);
      expect(result.isAllowed).toBe(true);
      expect(result.retryAfterSeconds).toBeUndefined();
    }
  });

  it("blocks the eleventh request in demo mode with retry after seconds (covers: AC-2)", () => {
    const ip = "192.168.1.2";
    for (let i = 0; i < 10; i++) {
      checkRateLimit(ip, true);
    }
    const eleventh = checkRateLimit(ip, true);
    expect(eleventh.isAllowed).toBe(false);
    expect(eleventh.retryAfterSeconds).toBeDefined();
    expect(eleventh.retryAfterSeconds).toBeGreaterThan(0);
    expect(eleventh.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("permits requests up to thirty in bring your own key mode (covers: AC-3)", () => {
    const ip = "192.168.1.3";
    for (let i = 0; i < 30; i++) {
      const result = checkRateLimit(ip, false);
      expect(result.isAllowed).toBe(true);
      expect(result.retryAfterSeconds).toBeUndefined();
    }
  });

  it("blocks the thirty first request in bring your own key mode (covers: AC-3)", () => {
    const ip = "192.168.1.4";
    for (let i = 0; i < 30; i++) {
      checkRateLimit(ip, false);
    }
    const blocked = checkRateLimit(ip, false);
    expect(blocked.isAllowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeDefined();
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("tracks rate limits independently for distinct IP addresses (covers: AC-1)", () => {
    const ipA = "10.0.0.1";
    const ipB = "10.0.0.2";

    for (let i = 0; i < 10; i++) {
      checkRateLimit(ipA, true);
    }
    expect(checkRateLimit(ipA, true).isAllowed).toBe(false);
    expect(checkRateLimit(ipB, true).isAllowed).toBe(true);
  });

  it("allows new requests once the sliding window expires (covers: AC-1)", () => {
    const ip = "10.0.0.3";
    for (let i = 0; i < 10; i++) {
      checkRateLimit(ip, true);
    }
    expect(checkRateLimit(ip, true).isAllowed).toBe(false);

    // Advance clock past the sixty second window
    vi.advanceTimersByTime(61000);

    expect(checkRateLimit(ip, true).isAllowed).toBe(true);
  });

  it("clears all rate limit state when reset is invoked (covers: AC-1)", () => {
    const ip = "10.0.0.4";
    for (let i = 0; i < 10; i++) {
      checkRateLimit(ip, true);
    }
    expect(checkRateLimit(ip, true).isAllowed).toBe(false);

    resetRateLimits();
    expect(checkRateLimit(ip, true).isAllowed).toBe(true);
  });
});

describe("checkIngestRateLimit", () => {
  beforeEach(() => {
    resetRateLimits();
  });

  it("blocks the eleventh ingest request from one client within a minute", () => {
    const ip = "203.0.113.20";
    for (let i = 0; i < 10; i++) {
      expect(checkIngestRateLimit(ip).isAllowed).toBe(true);
    }
    const blocked = checkIngestRateLimit(ip);
    expect(blocked.isAllowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("tracks ingest and AI query budgets separately", () => {
    const ip = "203.0.113.21";
    for (let i = 0; i < 10; i++) {
      checkIngestRateLimit(ip);
    }
    expect(checkIngestRateLimit(ip).isAllowed).toBe(false);
    expect(checkRateLimit(ip, false).isAllowed).toBe(true);
  });
});
