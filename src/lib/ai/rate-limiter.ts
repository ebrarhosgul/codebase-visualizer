/**
 * Simple in-memory sliding window rate limiter for the API routes.
 * State lives in one process, so with several instances each keeps its own
 * counts; put a shared limiter at the platform edge for a hard global limit.
 */
interface RateLimitBucket {
  timestamps: number[];
}

const rateLimitStore = new Map<string, RateLimitBucket>();

const WINDOW_MS = 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 1000;
const MAX_TRACKED_KEYS = 10_000;
let lastCleanup = Date.now();

function cleanupExpired(now: number): void {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) {
    return;
  }
  lastCleanup = now;
  for (const [key, bucket] of rateLimitStore.entries()) {
    const valid = bucket.timestamps.filter((t) => now - t < WINDOW_MS);
    if (valid.length === 0) {
      rateLimitStore.delete(key);
    } else {
      bucket.timestamps = valid;
    }
  }
}

function checkWindow(
  key: string,
  maxRequests: number,
): { isAllowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();

  cleanupExpired(now);

  const bucket = rateLimitStore.get(key) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < WINDOW_MS);

  if (bucket.timestamps.length >= maxRequests) {
    const oldestTimestamp = bucket.timestamps[0];
    const retryAfterSeconds = Math.ceil(
      (WINDOW_MS - (now - oldestTimestamp)) / 1000,
    );
    return {
      isAllowed: false,
      retryAfterSeconds: Math.max(1, retryAfterSeconds),
    };
  }

  bucket.timestamps.push(now);
  rateLimitStore.set(key, bucket);

  // Bound memory when a caller rotates identities: drop the oldest tracked key.
  if (rateLimitStore.size > MAX_TRACKED_KEYS) {
    const oldestKey = rateLimitStore.keys().next().value;
    if (oldestKey !== undefined) {
      rateLimitStore.delete(oldestKey);
    }
  }

  return { isAllowed: true };
}

/**
 * Checks if a client IP is within the rate limit for /api/ai/query.
 * Limits: 30 queries/minute for BYOK, 10 queries/minute for demo mode.
 */
export function checkRateLimit(
  clientIp: string,
  isDemo: boolean,
): { isAllowed: boolean; retryAfterSeconds?: number } {
  return checkWindow(clientIp, isDemo ? 10 : 30);
}

const INGEST_MAX_REQUESTS_PER_MINUTE = 10;

/**
 * Checks if a client IP is within the rate limit for /api/ingest.
 * Ingestion downloads and parses a whole repository, so it is limited to
 * 10 requests/minute per client, tracked separately from AI queries.
 */
export function checkIngestRateLimit(clientIp: string): {
  isAllowed: boolean;
  retryAfterSeconds?: number;
} {
  return checkWindow(`ingest:${clientIp}`, INGEST_MAX_REQUESTS_PER_MINUTE);
}

/**
 * Reset helper for testing.
 */
export function resetRateLimits(): void {
  rateLimitStore.clear();
}
