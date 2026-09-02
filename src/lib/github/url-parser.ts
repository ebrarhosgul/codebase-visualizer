/**
 * Parsed components of a GitHub repository URL.
 */
export interface ParsedGithubUrl {
  readonly owner: string;
  readonly repo: string;
  readonly branch?: string;
}

/**
 * Result type for GitHub URL parsing operations.
 */
export type ParseUrlResult =
  | { readonly success: true; readonly data: ParsedGithubUrl }
  | {
      readonly success: false;
      readonly error: string;
      readonly code: "INVALID_URL";
    };

const GITHUB_OWNER_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;
const GITHUB_REPO_REGEX = /^[a-zA-Z0-9._-]{1,100}$/;

/**
 * Pure function to parse and validate a public GitHub repository URL string.
 * Supports standard URLs, tree branch references, and git clone URLs.
 */
export function parseGithubUrl(rawUrl: string): ParseUrlResult {
  if (!rawUrl || typeof rawUrl !== "string") {
    return {
      success: false,
      code: "INVALID_URL",
      error: "Repository URL cannot be empty.",
    };
  }

  const trimmed = rawUrl.trim();
  if (trimmed.length === 0) {
    return {
      success: false,
      code: "INVALID_URL",
      error: "Repository URL cannot be empty.",
    };
  }

  // Strip protocol prefix if present
  let withoutProtocol = trimmed.replace(/^https?:\/\//i, "");

  // Remove query parameters and hash fragments
  const queryIndex = withoutProtocol.indexOf("?");
  if (queryIndex !== -1) {
    withoutProtocol = withoutProtocol.substring(0, queryIndex);
  }
  const hashIndex = withoutProtocol.indexOf("#");
  if (hashIndex !== -1) {
    withoutProtocol = withoutProtocol.substring(0, hashIndex);
  }

  // Remove trailing slashes
  withoutProtocol = withoutProtocol.replace(/\/+$/, "");

  // Check domain if present
  if (withoutProtocol.startsWith("github.com/")) {
    withoutProtocol = withoutProtocol.substring("github.com/".length);
  } else if (withoutProtocol.includes("/")) {
    // If it starts with another domain, reject
    const firstSegment = withoutProtocol.split("/")[0] ?? "";
    if (firstSegment.includes(".")) {
      return {
        success: false,
        code: "INVALID_URL",
        error: "Only public GitHub repositories are currently supported.",
      };
    }
  }

  const segments = withoutProtocol.split("/").filter(Boolean);
  if (segments.length < 2) {
    return {
      success: false,
      code: "INVALID_URL",
      error:
        "Please provide a valid GitHub repository URL in owner/repository format.",
    };
  }

  const owner = segments[0] ?? "";
  let repo = segments[1] ?? "";

  // Strip .git suffix if present
  if (repo.endsWith(".git")) {
    repo = repo.slice(0, -4);
  }

  if (repo === "." || repo === "..") {
    return {
      success: false,
      code: "INVALID_URL",
      error: "Repository name is invalid.",
    };
  }

  if (!GITHUB_OWNER_REGEX.test(owner)) {
    return {
      success: false,
      code: "INVALID_URL",
      error: `Invalid GitHub owner: "${owner}". GitHub usernames must be 1 to 39 characters.`,
    };
  }

  if (!GITHUB_REPO_REGEX.test(repo)) {
    return {
      success: false,
      code: "INVALID_URL",
      error: `Invalid GitHub repository name: "${repo}".`,
    };
  }

  // Optional tree branch parsing: /tree/{branch...}
  let branch: string | undefined;
  if (segments.length >= 4 && segments[2] === "tree") {
    const branchSegments = segments.slice(3);
    if (branchSegments.length > 0) {
      branch = branchSegments.join("/");
    }
  }

  return {
    success: true,
    data: {
      owner,
      repo,
      ...(branch ? { branch } : {}),
    },
  };
}
