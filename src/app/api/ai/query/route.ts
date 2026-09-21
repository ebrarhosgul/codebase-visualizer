import { NextRequest } from "next/server";
import { z } from "zod";
import { decryptApiKey, AI_KEY_COOKIE_NAME } from "@/lib/ai/crypto";
import { getAIProvider } from "@/lib/ai/provider-registry";
import { checkRateLimit } from "@/lib/ai/rate-limiter";
import { classifyError, sanitizeErrorMessage } from "@/lib/ai/error-classifier";
import {
  getClientIp,
  isSameOriginRequest,
  jsonResponse,
  readJsonBody,
} from "@/lib/security/request";
import type { AIRequestContext, AIStreamEvent } from "@/lib/ai/types";
import { repositorySchema, type CodebaseGraph } from "@/entities";

const MAX_BODY_BYTES = 10 * 1024 * 1024; // The graph payload dominates the size
const MAX_MESSAGES = 100;
const MAX_MESSAGE_CHARS = 100_000;
const MAX_CONTEXT_SUMMARY_CHARS = 200_000;

const aiQueryRequestSchema = z.object({
  repository: repositorySchema,
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string().max(MAX_MESSAGE_CHARS),
      }),
    )
    .max(MAX_MESSAGES),
  contextSummary: z.string().max(MAX_CONTEXT_SUMMARY_CHARS).optional(),
  // Top level shape only: the body size cap bounds the node payloads.
  graph: z
    .object({
      schemaVersion: z.number(),
      repository: repositorySchema,
      directories: z.record(z.string(), z.unknown()),
      files: z.record(z.string(), z.unknown()),
      symbols: z.record(z.string(), z.unknown()),
      externalModules: z.record(z.string(), z.unknown()),
      edges: z.record(z.string(), z.unknown()),
    })
    .optional(),
  isDemo: z.boolean().optional(),
  provider: z.enum(["gemini", "openai", "claude"]).optional(),
});

/**
 * Encodes an AIStreamEvent into a Server Sent Event data chunk.
 */
function formatSseChunk(event: AIStreamEvent): Uint8Array {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  return new TextEncoder().encode(payload);
}

/**
 * Route handler for POST /api/ai/query.
 * Streams real time AI responses, validated path traces, and code citations using Server Sent Events.
 * Live queries only ever use the caller's own key from their encrypted cookie;
 * the server never substitutes a key of its own.
 */
export async function POST(req: NextRequest): Promise<Response> {
  if (!isSameOriginRequest(req)) {
    return jsonResponse(403, { error: "Cross site requests are not allowed." });
  }

  const bodyResult = await readJsonBody(req, { maxBytes: MAX_BODY_BYTES });
  if (!bodyResult.ok) {
    return jsonResponse(bodyResult.status, {
      error:
        bodyResult.status === 413
          ? bodyResult.message
          : "Invalid request body. Expected JSON with repository and messages.",
    });
  }

  const parsedBody = aiQueryRequestSchema.safeParse(bodyResult.value);
  if (!parsedBody.success) {
    return jsonResponse(400, {
      error: "Missing or invalid fields: repository and messages array.",
    });
  }

  const {
    messages,
    contextSummary = "",
    isDemo = false,
    provider = "gemini",
  } = parsedBody.data;
  const repository = parsedBody.data.repository;
  const graph = parsedBody.data.graph as CodebaseGraph | undefined;

  // Enforce IP based rate limiting
  const clientIp = getClientIp(req);
  const rateLimitResult = checkRateLimit(clientIp, isDemo);

  if (!rateLimitResult.isAllowed) {
    const retrySeconds = rateLimitResult.retryAfterSeconds ?? 30;
    const notice = classifyError({
      status: 429,
      retryAfterSeconds: retrySeconds,
      provider,
    });
    return new Response(
      JSON.stringify({
        error: `Rate limit exceeded. Please wait ${retrySeconds} seconds before sending another query.`,
        code: notice.code,
        suggestedAction: notice.suggestedAction,
        retryAfterSeconds: notice.retryAfterSeconds,
        fallbackNotice: notice,
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(retrySeconds),
        },
      },
    );
  }

  // Live mode requires the caller's own key, stored in their encrypted cookie
  // and bound to the provider it was saved for. There is no server side key.
  let apiKey: string | undefined;
  if (!isDemo) {
    const cookieValue = req.cookies.get(AI_KEY_COOKIE_NAME)?.value;
    const decrypted = cookieValue ? decryptApiKey(cookieValue) : null;

    if (decrypted && decrypted.provider === provider) {
      apiKey = decrypted.apiKey;
    }

    if (!apiKey) {
      const notice = classifyError({
        status: 401,
        // Also reached when a saved key belongs to a different provider.
        message:
          "No API key provided for selected provider. Please enter your API key in Key Settings or switch to Demo Mode.",
        provider,
      });
      return new Response(
        JSON.stringify({
          error: notice.message,
          code: notice.code,
          suggestedAction: notice.suggestedAction,
          fallbackNotice: notice,
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  const activeProvider = getAIProvider(provider, isDemo);

  // Reconstruct minimal graph fallback if omitted from payload
  const activeGraph: CodebaseGraph = graph ?? {
    schemaVersion: 1,
    repository,
    directories: {},
    files: {},
    symbols: {},
    externalModules: {},
    edges: {},
  };

  const requestContext: AIRequestContext = {
    repository,
    contextSummary,
    graph: activeGraph,
  };

  const stream = new ReadableStream({
    async start(controller) {
      let isClosed = false;

      const safeEnqueue = (event: AIStreamEvent) => {
        if (isClosed) return;
        try {
          controller.enqueue(formatSseChunk(event));
        } catch {
          isClosed = true;
        }
      };

      const safeClose = () => {
        if (isClosed) return;
        isClosed = true;
        try {
          controller.close();
        } catch {
          // Stream already closed
        }
      };

      const abortHandler = () => {
        safeClose();
      };
      req.signal.addEventListener("abort", abortHandler, { once: true });

      try {
        const eventGenerator = activeProvider.streamQuery(
          messages,
          requestContext,
          apiKey,
          req.signal,
        );

        for await (const event of eventGenerator) {
          if (req.signal.aborted || isClosed) break;
          if (event.type === "error") {
            const sanitized = sanitizeErrorMessage(event.error);
            const notice = classifyError({
              message: sanitized,
              provider,
            });
            safeEnqueue({
              type: "error",
              error: notice.message,
              code: notice.code,
              suggestedAction: notice.suggestedAction,
              retryAfterSeconds: notice.retryAfterSeconds,
              fallbackNotice: notice,
            });
          } else {
            safeEnqueue(event);
          }
        }
      } catch (err: unknown) {
        if (!req.signal.aborted && !isClosed) {
          const rawMessage =
            err instanceof Error
              ? err.message
              : "Internal error processing AI query.";
          const sanitized = sanitizeErrorMessage(rawMessage);
          const notice = classifyError({
            error: err,
            message: sanitized,
            provider,
          });
          safeEnqueue({
            type: "error",
            error: notice.message,
            code: notice.code,
            suggestedAction: notice.suggestedAction,
            retryAfterSeconds: notice.retryAfterSeconds,
            fallbackNotice: notice,
          });
        }
      } finally {
        req.signal.removeEventListener("abort", abortHandler);
        safeClose();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
