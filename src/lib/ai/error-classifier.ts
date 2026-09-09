import type {
  AiFallbackAction,
  AiFallbackCode,
  AiFallbackNotice,
  AiProviderId,
} from "./types";

export interface ClassifyErrorInput {
  readonly status?: number;
  readonly error?: unknown;
  readonly message?: string;
  readonly code?: AiFallbackCode;
  readonly suggestedAction?: AiFallbackAction;
  readonly provider?: AiProviderId | "demo";
  readonly retryAfterSeconds?: number;
}

/**
 * Redacts secret keys, bearer tokens, file paths, and internal stack traces from error messages.
 */
export function sanitizeErrorMessage(rawMessage: string): string {
  if (!rawMessage) return "";

  let cleaned = rawMessage;

  // Redact Gemini API keys
  cleaned = cleaned.replace(/AIza[0-9A-Za-z-_]{35}/g, "[REDACTED_API_KEY]");

  // Redact OpenAI API keys
  cleaned = cleaned.replace(/sk-[0-9A-Za-z_-]{20,}/g, "[REDACTED_API_KEY]");

  // Redact Anthropic API keys
  cleaned = cleaned.replace(/sk-ant-[0-9A-Za-z_-]{20,}/g, "[REDACTED_API_KEY]");

  // Redact Bearer tokens
  cleaned = cleaned.replace(
    /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
    "Bearer [REDACTED_TOKEN]",
  );

  // Redact query parameter keys
  cleaned = cleaned.replace(/([?&]key=)[^&\s]+/gi, "$1[REDACTED_KEY]");

  // Redact absolute local filesystem paths
  cleaned = cleaned.replace(
    /(?:\/[\w.-]+)+\/([A-Za-z0-9_.-]+\.[a-zA-Z0-9]+)/g,
    "[REDACTED_PATH]/$1",
  );

  // Redact stack frame lines
  cleaned = cleaned.replace(
    /\s+at\s+.*(?:\(.*:[0-9]+:[0-9]+\)|:[0-9]+:[0-9]+)/g,
    "",
  );

  return cleaned.trim();
}

/**
 * Extracts a numeric retry duration in seconds if present in error text or headers.
 */
function extractRetrySeconds(text: string): number | undefined {
  const match = text.match(/wait\s+(\d+)\s+seconds?/i);
  if (match) {
    const seconds = parseInt(match[1], 10);
    if (!Number.isNaN(seconds) && seconds > 0) {
      return seconds;
    }
  }
  return undefined;
}

/**
 * Pure isomorphic function classifying errors into domain fallback notices with actionable recovery metadata.
 */
export function classifyError(input: ClassifyErrorInput): AiFallbackNotice {
  const { status, error, message, provider, retryAfterSeconds } = input;

  let rawText = message ?? "";
  if (!rawText && error) {
    if (error instanceof Error) {
      rawText = error.message;
    } else if (typeof error === "string") {
      rawText = error;
    } else if (
      typeof error === "object" &&
      error !== null &&
      "message" in error
    ) {
      rawText = String((error as { message: unknown }).message);
    }
  }

  const sanitized = sanitizeErrorMessage(rawText);
  const lower = (rawText + " " + (status ? String(status) : "")).toLowerCase();

  // Check offline status first if in browser environment
  const isBrowserOffline =
    typeof navigator !== "undefined" &&
    typeof navigator.onLine === "boolean" &&
    !navigator.onLine;

  // 1. Rate limiting
  const isRateLimit =
    input.code === "rate_limit" ||
    status === 429 ||
    lower.includes("rate limit") ||
    lower.includes("too many requests") ||
    lower.includes("resource_exhausted") ||
    lower.includes("resource exhausted") ||
    lower.includes("quota exceeded") ||
    lower.includes("quota");

  if (isRateLimit) {
    const waitTime = retryAfterSeconds ?? extractRetrySeconds(rawText) ?? 60;
    return {
      code: "rate_limit",
      title: "Rate Limit Exceeded",
      message: `The AI query rate limit has been reached. Please wait ${waitTime} seconds before submitting again, or switch to Demo Mode for instant local responses.`,
      suggestedAction: input.suggestedAction ?? "switch_demo",
      retryAfterSeconds: waitTime,
      provider,
    };
  }

  // 2. Authentication failures
  const isAuthError =
    input.code === "auth_error" ||
    status === 401 ||
    status === 403 ||
    lower.includes("api key") ||
    lower.includes("unauthorized") ||
    lower.includes("authentication") ||
    lower.includes("forbidden") ||
    lower.includes("permission_denied") ||
    lower.includes("invalid_api_key");

  if (isAuthError) {
    return {
      code: "auth_error",
      title: "API Key Required",
      message:
        "No valid API key was found or the provided credentials have expired. Update your key in Key Settings or switch to Demo Mode.",
      suggestedAction: input.suggestedAction ?? "open_keys",
      provider,
    };
  }

  // 3. Network connection issues and client offline states
  const isNetworkTimeout =
    input.code === "network_timeout" ||
    isBrowserOffline ||
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("network timeout") ||
    lower.includes("etimedout") ||
    lower.includes("econnrefused") ||
    lower.includes("enotfound") ||
    lower.includes("connection refused") ||
    lower.includes("offline");

  if (isNetworkTimeout) {
    return {
      code: "network_timeout",
      title: "Connection Lost",
      message:
        "Unable to reach the AI service due to network unavailability. You can switch to Demo Mode to explore local architecture offline.",
      suggestedAction: input.suggestedAction ?? "switch_demo",
      provider,
    };
  }

  // 4. Upstream provider outages and server internal faults
  const isProviderOutage =
    input.code === "provider_outage" ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    lower.includes("service unavailable") ||
    lower.includes("bad gateway") ||
    lower.includes("gateway timeout") ||
    lower.includes("overloaded") ||
    lower.includes("internal server error");

  if (isProviderOutage) {
    return {
      code: "provider_outage",
      title: "Provider Service Outage",
      message:
        "The upstream AI service is temporarily unavailable or overloaded. You can retry shortly or switch to Demo Mode.",
      suggestedAction: input.suggestedAction ?? "switch_demo",
      provider,
    };
  }

  // 5. Unknown or unexpected failures
  return {
    code: "unknown",
    title: "AI Service Notice",
    message:
      sanitized ||
      "An unexpected error occurred while processing the AI query.",
    suggestedAction: "retry",
    provider,
  };
}
