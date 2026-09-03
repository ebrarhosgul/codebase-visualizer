import { NextRequest } from "next/server";
import {
  parseGithubUrl,
  fetchRepoMetadata,
  fetchTarballArchive,
} from "@/lib/github";
import { unpackRepositoryTarball, parseRepositoryAst } from "@/lib/parser";
import type { IngestRequest, IngestStreamEvent } from "@/types/ingestion";

const INGESTION_TIMEOUT_MS = 30000; // 30 second defensive timeout

/**
 * Encodes an IngestStreamEvent into a Server Sent Event data chunk.
 */
function formatSseChunk(event: IngestStreamEvent): Uint8Array {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  return new TextEncoder().encode(payload);
}

/**
 * Route handler for POST /api/ingest.
 * Streams real time ingestion progress and final parsed CodebaseGraph using Server Sent Events.
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

  const { repositoryUrl, branch: explicitBranch, githubToken } = body;

  const stream = new ReadableStream({
    async start(controller) {
      let isClosed = false;

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
          token: githubToken,
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
            token: githubToken,
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

        // Phase 3: In-memory tarball extraction & file prioritization
        safeEnqueue({
          phase: "unpacking_files",
          progress: {
            phase: "unpacking_files",
            current: 50,
            total: 100,
            message: "Unpacking archive and prioritizing source files...",
          },
        });

        const extraction = await unpackRepositoryTarball(
          archiveResult.data,
          100,
        );

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

        // Phase 4: AST parsing and dependency graph building
        safeEnqueue({
          phase: "parsing_ast",
          progress: {
            phase: "parsing_ast",
            current: 75,
            total: 100,
            message: `Parsing abstract syntax tree for ${extraction.files.length} files...`,
          },
        });

        const parsedData = parseRepositoryAst(
          extraction.files,
          {
            ...repoInfo,
            defaultBranch: targetBranch,
          },
          extraction.tsconfigContent,
        );

        // Phase 5: Complete
        safeEnqueue({
          phase: "complete",
          progress: {
            phase: "complete",
            current: 100,
            total: 100,
            message: `Successfully analyzed ${extraction.files.length} files.`,
          },
          result: {
            repository: parsedData.graph.repository,
            graph: parsedData.graph,
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
