export const GITHUB_PAT_COOKIE_NAME = "github_pat";

/**
 * Validates that the provided token matches GitHub token prefix conventions.
 * Supports classic personal access tokens (ghp_) and fine-grained tokens (github_pat_).
 */
export function validateGithubTokenFormat(token: string): boolean {
  if (!token || typeof token !== "string") {
    return false;
  }
  const clean = token.trim();
  if (clean.startsWith("ghp_") && clean.length >= 20) {
    return true;
  }
  if (clean.startsWith("github_pat_") && clean.length >= 25) {
    return true;
  }
  return false;
}

/**
 * Masks a GitHub token for safe client display, preserving prefix and last 4 characters.
 */
export function maskGithubToken(token: string): string {
  const clean = token.trim();
  const lastFour = clean.slice(-4);
  if (clean.startsWith("github_pat_")) {
    return `github_pat_...${lastFour}`;
  }
  if (clean.startsWith("ghp_")) {
    return `ghp_...${lastFour}`;
  }
  return `...${lastFour}`;
}
