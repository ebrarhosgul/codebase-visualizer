import { NextRequest } from "next/server";
import {
  parseGithubUrl,
  fetchRepoMetadata,
  fetchTarballArchive,
  fetchBranchCommitSha,
  GITHUB_PAT_COOKIE_NAME,
} from "@/lib/github";
import { decryptGithubToken } from "@/lib/github/crypto";
import { unpackRepositoryTarball, parseRepositoryAst } from "@/lib/parser";
import type { IngestRequest, IngestStreamEvent } from "@/types/ingestion";

const INGESTION_TIMEOUT_MS = 30000; // 30 second defensive timeout
const PROGRESS_THROTTLE_MS = 100; // Minimum 100ms interval between granular progress events (AC-4)

/**
 * Encodes an IngestStreamEvent into a Server Sent Event data chunk.
 */
function formatSseChunk(event: IngestStreamEvent): Uint8Array {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  return new TextEncoder().encode(payload);
}

/**
 * Route handler for POST /api/ingest.
 * Streams real time ingestion progress, handles commit SHA cache hit checks,
 * and yields final parsed CodebaseGraph using Server Sent Events.
 */
export async function POST(req: NextRequest): Promise<Response> {
  let body: IngestRequest;
  try {
    body = (await req.json()) as IngestRequest;
  } catch {
    return new Response(
      JSON.stringify({
        code: "INVALID_URL",
        message: "Invalid request body. Expected JSON with repositoryUrl.",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const {
    repositoryUrl,
    branch: explicitBranch,
    githubToken,
    cachedCommitSha,
    forceFresh,
  } = body;

  // Resolve token from encrypted httpOnly cookie first, then fallback to request body (AC-5)
  const cookieValue = req.cookies.get(GITHUB_PAT_COOKIE_NAME)?.value;
  const decryptedCookieToken = cookieValue
    ? decryptGithubToken(cookieValue)
    : null;
  const effectiveToken = decryptedCookieToken || githubToken;

  const stream = new ReadableStream({
    async start(controller) {
      let isClosed = false;
      let lastProgressEmitTime = 0;

      const safeEnqueue = (event: IngestStreamEvent) => {
        if (isClosed) {
          return;
        }
        try {
          controller.enqueue(formatSseChunk(event));
        } catch {
          isClosed = true;
        }
      };

      const safeClose = () => {
        if (isClosed) {
          return;
        }
        isClosed = true;
        try {
          controller.close();
        } catch {
          // Stream already terminated
        }
      };

      // Create composite abort signal combining request signal and 30s timeout
      const timeoutController = new AbortController();
      const timeoutTimer = setTimeout(() => {
        timeoutController.abort(
          new Error("Ingestion timed out after 30 seconds."),
        );
      }, INGESTION_TIMEOUT_MS);

      const abortHandler = () => {
        timeoutController.abort();
      };
      req.signal.addEventListener("abort", abortHandler);

      try {
        // Phase 1: Validating URL and resolving repository metadata
        safeEnqueue({
          phase: "validating",
          progress: {
            phase: "validating",
            current: 5,
            total: 100,
            message: "Validating GitHub repository URL...",
          },
        });

        const parseResult = parseGithubUrl(repositoryUrl);
        if (!parseResult.success) {
          safeEnqueue({
            phase: "error",
            error: {
              code: "INVALID_URL",
              message: parseResult.error,
            },
          });
          safeClose();
          return;
        }

        const { owner, repo, branch: urlBranch } = parseResult.data;
        const requestedBranch = explicitBranch || urlBranch;

        const metaResult = await fetchRepoMetadata(owner, repo, {
          token: effectiveToken,
          signal: timeoutController.signal,
        });

        if (!metaResult.success) {
          safeEnqueue({
            phase: "error",
            error: metaResult.error,
          });
          safeClose();
          return;
        }

        const repoInfo = metaResult.data;
        const targetBranch = requestedBranch || repoInfo.defaultBranch;

        // Verify upstream branch head commit hash via GitHub API (AC-2)
        const commitResult = await fetchBranchCommitSha(
          owner,
          repo,
          targetBranch,
          {
            token: effectiveToken,
            signal: timeoutController.signal,
          },
        );

        if (!commitResult.success) {
          safeEnqueue({
            phase: "error",
            error: commitResult.error,
          });
          safeClose();
          return;
        }

        const upstreamCommitSha = commitResult.data;

        // Check cache hit: if commit hash matches and not forced fresh, instruct client to hydrate (AC-2)
        if (
          !forceFresh &&
          cachedCommitSha &&
          cachedCommitSha.trim() === upstreamCommitSha.trim()
        ) {
          safeEnqueue({
            phase: "complete",
            cached: true,
            commitSha: upstreamCommitSha,
            message: "Repository is up to date with cached version.",
          });
          safeClose();
          return;
        }

        // Phase 2: Downloading archive tarball (single request, 1 rate limit point)
        safeEnqueue({
          phase: "downloading_archive",
          progress: {
            phase: "downloading_archive",
            current: 25,
            total: 100,
            message: `Downloading archive for ${owner}/${repo} (${targetBranch})...`,
          },
        });

        const archiveResult = await fetchTarballArchive(
          owner,
          repo,
          targetBranch,
          {
            token: effectiveToken,
            signal: timeoutController.signal,
          },
        );

        if (!archiveResult.success) {
          safeEnqueue({
            phase: "error",
            error: archiveResult.error,
          });
          safeClose();
          return;
        }

        // Phase 3: In-memory tarball extraction & file prioritization with throttled progress (AC-4)
        safeEnqueue({
          phase: "unpacking_files",
          progress: {
            phase: "unpacking_files",
            current: 40,
            total: 100,
            message: "Unpacking archive and prioritizing source files...",
          },
        });

        const extraction = await unpackRepositoryTarball(archiveResult.data, {
          maxFiles: 200,
          includeNonSourceFiles: true,
          onProgress: (count, currentPath) => {
            const now = Date.now();
            if (now - lastProgressEmitTime >= PROGRESS_THROTTLE_MS) {
              lastProgressEmitTime = now;
              safeEnqueue({
                phase: "unpacking_files",
                progress: {
                  phase: "unpacking_files",
                  current: Math.min(60, 40 + Math.round((count / 200) * 20)),
                  total: 100,
                  message: `Unpacking file ${count}: ${currentPath}...`,
                  detail: {
                    currentItem: count,
                    currentItemName: currentPath,
                  },
                },
              });
            }
          },
        });

        if (extraction.files.length === 0) {
          safeEnqueue({
            phase: "error",
            error: {
              code: "PARSE_FAILED",
              message:
                "No TypeScript or JavaScript source files found in the specified repository.",
            },
          });
          safeClose();
          return;
        }

        // Phase 4: AST parsing and dependency graph building with granular file counters (AC-4)
        safeEnqueue({
          phase: "parsing_ast",
          progress: {
            phase: "parsing_ast",
            current: 65,
            total: 100,
            message: `Parsing abstract syntax tree for ${extraction.files.length} files...`,
            detail: {
              currentItem: 0,
              totalItems: extraction.files.length,
            },
          },
        });

        const parsedData = parseRepositoryAst(
          extraction.files,
          {
            ...repoInfo,
            defaultBranch: targetBranch,
            commitSha: upstreamCommitSha,
          },
          extraction.tsconfigContent,
          (currentItem, totalItems, currentItemName) => {
            const now = Date.now();
            if (
              now - lastProgressEmitTime >= PROGRESS_THROTTLE_MS ||
              currentItem === totalItems
            ) {
              lastProgressEmitTime = now;
              safeEnqueue({
                phase: "parsing_ast",
                progress: {
                  phase: "parsing_ast",
                  current: Math.min(
                    95,
                    65 + Math.round((currentItem / totalItems) * 30),
                  ),
                  total: 100,
                  message: `Parsing TypeScript AST module ${currentItem} of ${totalItems}: ${currentItemName}...`,
                  detail: {
                    currentItem,
                    totalItems,
                    currentItemName,
                  },
                },
              });
            }
          },
        );

        const nodeCount =
          Object.keys(parsedData.graph.files).length +
          Object.keys(parsedData.graph.directories).length +
          Object.keys(parsedData.graph.symbols).length;
        const fileCount = extraction.files.length;

        // Phase 5: Complete
        safeEnqueue({
          phase: "complete",
          commitSha: upstreamCommitSha,
          fileCount,
          nodeCount,
          progress: {
            phase: "complete",
            current: 100,
            total: 100,
            message: `Successfully analyzed ${fileCount} files.`,
          },
          result: {
            repository: {
              ...parsedData.graph.repository,
              commitSha: upstreamCommitSha,
            },
            graph: {
              ...parsedData.graph,
              repository: {
                ...parsedData.graph.repository,
                commitSha: upstreamCommitSha,
              },
            },
            fileSources: parsedData.fileSources,
          },
        });

        safeClose();
      } catch (err: unknown) {
        if (req.signal.aborted || timeoutController.signal.aborted) {
          safeEnqueue({
            phase: "error",
            error: {
              code: "TIMEOUT",
              message:
                err instanceof Error
                  ? err.message
                  : "Ingestion timed out or was aborted.",
            },
          });
        } else {
          safeEnqueue({
            phase: "error",
            error: {
              code: "PARSE_FAILED",
              message:
                err instanceof Error
                  ? err.message
                  : "Unexpected failure during repository analysis.",
            },
          });
        }
        safeClose();
      } finally {
        clearTimeout(timeoutTimer);
        req.signal.removeEventListener("abort", abortHandler);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
