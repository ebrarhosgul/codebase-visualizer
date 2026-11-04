/**
 * Validates whether a video URI originates from an approved Scrimba CDN,
 * custom media origin, or a safe client-side blob / data URI for demo playback.
 * Prevents javascript:, data:text/html, and arbitrary third-party tracking origins.
 */
export function isAllowedVideoUri(rawUri: string | null | undefined): boolean {
  if (!rawUri || typeof rawUri !== "string") {
    return false;
  }

  const trimmed = rawUri.trim();

  // Allow client-generated blob URLs
  if (trimmed.startsWith("blob:")) {
    return true;
  }

  // Allow base64 video data URIs
  if (
    trimmed.startsWith("data:video/webm;") ||
    trimmed.startsWith("data:video/mp4;")
  ) {
    return true;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:") {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();

    // Default Scrimba CDN domain rules
    if (
      hostname === "scrimba.com" ||
      hostname.endsWith(".scrimba.com") ||
      hostname === "api.scrimba.com" ||
      hostname === "cdn.scrimba.com"
    ) {
      return true;
    }

    // Optional environment-configured media origin
    const customOrigin = process.env.SCRIMBA_MEDIA_ORIGIN;
    if (customOrigin) {
      const customUrl = new URL(customOrigin);
      if (customUrl.origin === parsed.origin) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}
