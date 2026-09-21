import type { GitHubRepoInfo, IngestError } from "@/types/ingestion";

export interface GitHubClientOptions {
  readonly token?: string;
  readonly signal?: AbortSignal;
}

export type GitHubResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: IngestError };

const USER_AGENT = "Codebase-Visualizer/0.1.0";

/**
 * Largest repository archive the server will download into memory.
 */
export const MAX_ARCHIVE_DOWNLOAD_BYTES = 100 * 1024 * 1024; // 100 MB

/**
 * Builds standard GitHub API headers including optional authorization.
 * Only a token supplied by the user is ever sent. The server never falls back
 * to its own GitHub credential, so anonymous requests stay anonymous.
 */
function buildHeaders(token?: string): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": USER_AGENT,
  };

  if (token && token.trim().length > 0) {
    headers.Authorization = `Bearer ${token.trim()}`;
  }

  return headers;
}

/**
 * Reads a response body into memory, refusing to buffer more than maxBytes.
 * Returns null when the limit is exceeded. The cap is enforced while streaming
 * so a missing or dishonest Content-Length cannot bypass it.
 */
async function readBodyWithLimit(
  response: Response,
  maxBytes: number,
): Promise<ArrayBuffer | null> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel();
    return null;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    const buffer = await response.arrayBuffer();
    return buffer.byteLength > maxBytes ? null : buffer;
  }

  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged.buffer;
}

/**
 * Parses rate limit reset header timestamp from GitHub HTTP response.
 */
function parseRateLimitReset(response: Response): number | undefined {
  const resetHeader = response.headers.get("x-ratelimit-reset");
  if (!resetHeader) {
    return undefined;
  }
  const parsed = parseInt(resetHeader, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/**
 * Fetches repository metadata and discovers default branch from GitHub REST API.
 */
export async function fetchRepoMetadata(
  owner: string,
  repo: string,
  options: GitHubClientOptions = {},
): Promise<GitHubResult<GitHubRepoInfo>> {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: buildHeaders(options.token),
      signal: options.signal,
    });

    if (!response.ok) {
      const reset = parseRateLimitReset(response);
      const remaining = response.headers.get("x-ratelimit-remaining");

      if (response.status === 404) {
        return {
          success: false,
          error: {
            code: "REPO_NOT_FOUND",
            message: `Repository "${owner}/${repo}" was not found or is private.`,
          },
        };
      }

      if (response.status === 403 || response.status === 429) {
        if (remaining === "0") {
          return {
            success: false,
            error: {
              code: "RATE_LIMITED",
              message:
                "GitHub API rate limit exceeded. Please provide a Personal Access Token or try again later.",
              rateLimitReset: reset,
            },
          };
        }
      }

      return {
        success: false,
        error: {
          code: "REPO_NOT_FOUND",
          message: `GitHub API returned HTTP ${response.status}: ${response.statusText}`,
          rateLimitReset: reset,
        },
      };
    }

    const data = (await response.json()) as {
      readonly owner?: { readonly login?: string };
      readonly name?: string;
      readonly full_name?: string;
      readonly default_branch?: string;
      readonly description?: string;
    };

    const defaultBranch = data.default_branch || "main";

    return {
      success: true,
      data: {
        owner: data.owner?.login || owner,
        name: data.name || repo,
        fullName: data.full_name || `${owner}/${repo}`,
        defaultBranch,
        commitSha: defaultBranch,
        ...(data.description ? { description: data.description } : {}),
      },
    };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return {
        success: false,
        error: {
          code: "ABORTED",
          message: "Repository request was cancelled.",
        },
      };
    }

    return {
      success: false,
      error: {
        code: "REPO_NOT_FOUND",
        message:
          err instanceof Error
            ? err.message
            : "Network error fetching repository metadata.",
      },
    };
  }
}

/**
 * Fetches the latest commit SHA for a specific branch via GitHub Commits API.
 * Uses GET /repos/{owner}/{repo}/commits/{branch} to verify freshness without archive download.
 */
export async function fetchBranchCommitSha(
  owner: string,
  repo: string,
  branch: string,
  options: GitHubClientOptions = {},
): Promise<GitHubResult<string>> {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(branch)}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: buildHeaders(options.token),
      signal: options.signal,
    });

    if (!response.ok) {
      const reset = parseRateLimitReset(response);
      const remaining = response.headers.get("x-ratelimit-remaining");

      if (response.status === 404) {
        return {
          success: false,
          error: {
            code: "REPO_NOT_FOUND",
            message: `Branch "${branch}" for repository "${owner}/${repo}" was not found.`,
          },
        };
      }

      if (
        (response.status === 403 || response.status === 429) &&
        remaining === "0"
      ) {
        return {
          success: false,
          error: {
            code: "RATE_LIMITED",
            message:
              "GitHub rate limit exceeded during commit verification. Please supply a Personal Access Token.",
            rateLimitReset: reset,
          },
        };
      }

      return {
        success: false,
        error: {
          code: "REPO_NOT_FOUND",
          message: `GitHub API returned status ${response.status} while fetching branch commit.`,
          rateLimitReset: reset,
        },
      };
    }

    const data = (await response.json()) as { readonly sha?: string };
    if (!data.sha || typeof data.sha !== "string") {
      return {
        success: false,
        error: {
          code: "PARSE_FAILED",
          message: "Unable to resolve commit SHA from GitHub response.",
        },
      };
    }

    return {
      success: true,
      data: data.sha,
    };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return {
        success: false,
        error: {
          code: "ABORTED",
          message: "Commit verification was cancelled.",
        },
      };
    }

    return {
      success: false,
      error: {
        code: "TIMEOUT",
        message:
          err instanceof Error
            ? err.message
            : "Network error fetching branch commit SHA.",
      },
    };
  }
}

/**
 * Downloads the repository tarball archive stream in a single request.
 * Follows GitHub 302 redirect directly to codeload archive.
 */
export async function fetchTarballArchive(
  owner: string,
  repo: string,
  branch: string,
  options: GitHubClientOptions = {},
): Promise<GitHubResult<ArrayBuffer>> {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tarball/${encodeURIComponent(branch)}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: buildHeaders(options.token),
      signal: options.signal,
      redirect: "follow",
    });

    if (!response.ok) {
      const reset = parseRateLimitReset(response);
      const remaining = response.headers.get("x-ratelimit-remaining");

      if (response.status === 404) {
        return {
          success: false,
          error: {
            code: "REPO_NOT_FOUND",
            message: `Archive for "${owner}/${repo}" branch "${branch}" was not found.`,
          },
        };
      }

      if (
        (response.status === 403 || response.status === 429) &&
        remaining === "0"
      ) {
        return {
          success: false,
          error: {
            code: "RATE_LIMITED",
            message:
              "GitHub rate limit exceeded during archive download. Please supply a Personal Access Token.",
            rateLimitReset: reset,
          },
        };
      }

      return {
        success: false,
        error: {
          code: "REPO_NOT_FOUND",
          message: `GitHub returned status ${response.status} while downloading archive.`,
          rateLimitReset: reset,
        },
      };
    }

    const buffer = await readBodyWithLimit(
      response,
      MAX_ARCHIVE_DOWNLOAD_BYTES,
    );
    if (!buffer) {
      return {
        success: false,
        error: {
          code: "FILE_LIMIT_EXCEEDED",
          message: `Repository archive is larger than the ${MAX_ARCHIVE_DOWNLOAD_BYTES / (1024 * 1024)} MB limit.`,
        },
      };
    }

    return {
      success: true,
      data: buffer,
    };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return {
        success: false,
        error: {
          code: "ABORTED",
          message: "Archive download was cancelled.",
        },
      };
    }

    return {
      success: false,
      error: {
        code: "TIMEOUT",
        message:
          err instanceof Error
            ? err.message
            : "Network error downloading repository archive.",
      },
    };
  }
}
