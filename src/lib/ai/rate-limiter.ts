/**
 * Simple in-memory sliding window rate limiter for /api/ai/query requests.
 */
interface RateLimitBucket {
  timestamps: number[];
}

const rateLimitStore = new Map<string, RateLimitBucket>();

const CLEANUP_INTERVAL_MS = 60 * 1000;
let lastCleanup = Date.now();

function cleanupExpired(windowMs: number, now: number): void {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) {
    return;
  }
  lastCleanup = now;
  for (const [ip, bucket] of rateLimitStore.entries()) {
    const valid = bucket.timestamps.filter((t) => now - t < windowMs);
    if (valid.length === 0) {
      rateLimitStore.delete(ip);
    } else {
      bucket.timestamps = valid;
    }
  }
}

/**
 * Checks if a client IP is within the rate limit.
 * Limits: 30 queries/minute for BYOK, 10 queries/minute for demo mode.
 */
export function checkRateLimit(
  clientIp: string,
  isDemo: boolean,
): { isAllowed: boolean; retryAfterSeconds?: number } {
  const maxRequests = isDemo ? 10 : 30;
  const windowMs = 60 * 1000;
  const now = Date.now();

  cleanupExpired(windowMs, now);

  const bucket = rateLimitStore.get(clientIp) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs);

  if (bucket.timestamps.length >= maxRequests) {
    const oldestTimestamp = bucket.timestamps[0];
    const retryAfterSeconds = Math.ceil(
      (windowMs - (now - oldestTimestamp)) / 1000,
    );
    return {
      isAllowed: false,
      retryAfterSeconds: Math.max(1, retryAfterSeconds),
    };
  }

  bucket.timestamps.push(now);
  rateLimitStore.set(clientIp, bucket);

  return { isAllowed: true };
}

/**
 * Reset helper for testing.
 */
export function resetRateLimits(): void {
  rateLimitStore.clear();
}
