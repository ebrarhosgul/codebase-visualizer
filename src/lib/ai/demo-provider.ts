import type { AIProvider, AIRequestContext, AIStreamEvent } from "./types";
import type { DemoIntent } from "./demo/intents";
import { getHeuristicIndex } from "@/graph/heuristic-index";
import { resolveDemoIntent } from "./demo/router";
import { chunkMarkdown, sleep } from "./demo/chunker";
import { DEMO_CHUNK_INTERVAL_MS } from "./demo/limits";
import { buildCentralFilesAnswer } from "./demo/builders/central-files";
import { buildLayerBreakdownAnswer } from "./demo/builders/layer-breakdown";
import { buildStateFlowAnswer } from "./demo/builders/state-flow";
import { buildOverviewAnswer } from "./demo/builders/overview";
import { buildPathTraceAnswer } from "./demo/builders/path-trace";

/**
 * Zero-cost demo provider delivering client-side graph heuristics and verified dependency traces.
 */
export class DemoAIProvider implements AIProvider {
  readonly id = "demo" as const;
  readonly name = "Demo Mode (Offline)";

  async *streamQuery(
    messages: readonly {
      readonly role: "user" | "assistant" | "system";
      readonly content: string;
    }[],
    context: AIRequestContext,
    _apiKey?: string,
    signal?: AbortSignal,
    hints?: { readonly intent?: DemoIntent },
  ): AsyncGenerator<AIStreamEvent, void, unknown> {
    const lastUserMessage = [...messages]
      .reverse()
      .find((m) => m.role === "user");
    const query = lastUserMessage?.content.trim() ?? "";

    const intent = resolveDemoIntent(query, hints?.intent);

    let answer;
    if (intent === "path_trace") {
      answer = buildPathTraceAnswer(context, query);
    } else {
      const index = getHeuristicIndex(context.graph);
      switch (intent) {
        case "central_files":
          answer = buildCentralFilesAnswer(context.graph, index);
          break;
        case "layer_breakdown":
          answer = buildLayerBreakdownAnswer(context.graph, index);
          break;
        case "state_flow":
          answer = buildStateFlowAnswer(context.graph, index);
          break;
        case "overview":
        default:
          answer = buildOverviewAnswer(context.graph, index);
          break;
      }
    }

    const chunks = chunkMarkdown(answer.markdown);

    for (const chunk of chunks) {
      if (signal?.aborted) return;
      yield { type: "text", text: chunk };
      await sleep(DEMO_CHUNK_INTERVAL_MS, signal);
    }

    if (signal?.aborted) return;

    if (answer.trace) {
      yield { type: "trace", trace: answer.trace };
    }

    if (answer.citations.length > 0) {
      yield { type: "citations", citations: answer.citations };
    }

    if (answer.warning) {
      yield { type: "warning", message: answer.warning };
    }

    // Emit highlight event only for non-path-trace, non-fallback answers with cited nodes
    if (
      answer.intent !== "path_trace" &&
      !answer.isFallback &&
      answer.highlightNodeIds.length > 0
    ) {
      yield { type: "highlight", nodeIds: answer.highlightNodeIds };
    }

    yield { type: "done" };
  }
}
