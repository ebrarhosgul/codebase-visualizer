import { NextRequest } from "next/server";
import { decryptApiKey, AI_KEY_COOKIE_NAME } from "@/lib/ai/crypto";
import { getAIProvider } from "@/lib/ai/provider-registry";
import { checkRateLimit } from "@/lib/ai/rate-limiter";
import type {
  AIRequestContext,
  AIStreamEvent,
  AiProviderId,
} from "@/lib/ai/types";
import type { CodebaseGraph, Repository } from "@/entities";

interface AIQueryRequestBody {
  readonly repository: Repository;
  readonly messages: readonly {
    readonly role: "user" | "assistant" | "system";
    readonly content: string;
  }[];
  readonly contextSummary?: string;
  readonly graph?: CodebaseGraph;
  readonly isDemo?: boolean;
  readonly provider?: AiProviderId;
}

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
 */
export async function POST(req: NextRequest): Promise<Response> {
  let body: AIQueryRequestBody;
  try {
    body = (await req.json()) as AIQueryRequestBody;
  } catch {
    return new Response(
      JSON.stringify({
        error:
          "Invalid request body. Expected JSON with repository and messages.",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const {
    repository,
    messages,
    contextSummary = "",
    graph,
    isDemo = false,
    provider = "gemini",
  } = body;

  if (!repository || !messages || !Array.isArray(messages)) {
    return new Response(
      JSON.stringify({
        error: "Missing required fields: repository and messages array.",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Enforce IP based rate limiting
  const forwarded = req.headers.get("x-forwarded-for");
  const clientIp = forwarded ? forwarded.split(",")[0].trim() : "127.0.0.1";
  const rateLimitResult = checkRateLimit(clientIp, isDemo);

  if (!rateLimitResult.isAllowed) {
    return new Response(
      JSON.stringify({
        error: `Rate limit exceeded. Please wait ${rateLimitResult.retryAfterSeconds} seconds before sending another query.`,
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(rateLimitResult.retryAfterSeconds ?? 30),
        },
      },
    );
  }

  // Retrieve decrypted BYOK API key if available
  let apiKey: string | undefined;
  const cookieValue = req.cookies.get(AI_KEY_COOKIE_NAME)?.value;
  if (cookieValue) {
    const decrypted = decryptApiKey(cookieValue);
    if (decrypted) {
      apiKey = decrypted.apiKey;
    }
  }

  // In non-demo mode, if no user key is provided in cookie, check server fallback
  if (!isDemo && !apiKey) {
    if (provider === "gemini") {
      apiKey = process.env.GEMINI_API_KEY;
    } else if (provider === "openai") {
      apiKey = process.env.OPENAI_API_KEY;
    } else if (provider === "claude") {
      apiKey = process.env.ANTHROPIC_API_KEY;
    }

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error:
            "No API key provided for selected provider. Please enter your API key in Key Settings or switch to Demo Mode.",
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
          safeEnqueue(event);
        }
      } catch (err: unknown) {
        if (!req.signal.aborted && !isClosed) {
          safeEnqueue({
            type: "error",
            error:
              err instanceof Error
                ? err.message
                : "Internal error processing AI query.",
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
