import type {
  AIProvider,
  AIRequestContext,
  AIStreamEvent,
  CitationRef,
} from "./types";
import { validateOrDiscoverPath } from "@/graph/path-validation";

/**
 * OpenAI GPT provider with streaming chat completions.
 */
export class OpenAIProvider implements AIProvider {
  readonly id = "openai" as const;
  readonly name = "OpenAI GPT";

  async *streamQuery(
    messages: readonly {
      readonly role: "user" | "assistant" | "system";
      readonly content: string;
    }[],
    context: AIRequestContext,
    apiKey?: string,
    signal?: AbortSignal,
  ): AsyncGenerator<AIStreamEvent, void, unknown> {
    const activeKey = apiKey || process.env.OPENAI_API_KEY;
    if (!activeKey) {
      yield {
        type: "error",
        error:
          "Missing OpenAI API key. Please configure a key in Key Settings or use Demo Mode.",
      };
      return;
    }

    const systemMessage = {
      role: "system",
      content: `You are an expert software architect analyzing the codebase "${context.repository.fullName}".
Answer architectural questions clearly and accurately based on this context:
${context.contextSummary}`,
    };

    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${activeKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          stream: true,
          messages: [systemMessage, ...messages],
        }),
        signal,
      });
    } catch (err) {
      yield {
        type: "error",
        error:
          err instanceof Error
            ? err.message
            : "Failed to connect to OpenAI API.",
      };
      return;
    }

    if (!response.ok) {
      const errorText = await response.text();
      yield {
        type: "error",
        error: `OpenAI API returned HTTP ${response.status}: ${errorText}`,
      };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      yield { type: "error", error: "Empty response body from OpenAI API." };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let accumulatedText = "";

    try {
      while (true) {
        if (signal?.aborted) return;
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const jsonStr = trimmed.slice(5).trim();
          if (jsonStr === "[DONE]") continue;

          try {
            const data = JSON.parse(jsonStr) as {
              choices?: Array<{
                delta?: { content?: string };
              }>;
            };
            const chunk = data.choices?.[0]?.delta?.content;
            if (chunk) {
              accumulatedText += chunk;
              yield { type: "text", text: chunk };
            }
          } catch {
            // Ignore unparseable chunks
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Post-process citations
    const detectedCitations: CitationRef[] = [];
    for (const file of Object.values(context.graph.files)) {
      if (
        accumulatedText.includes(file.name) ||
        accumulatedText.includes(file.path)
      ) {
        detectedCitations.push({
          id: `cite:${file.id}_1`,
          fileId: file.id,
          line: 1,
          label: file.name,
          snippet: file.path,
        });
        if (detectedCitations.length >= 6) break;
      }
    }

    if (detectedCitations.length >= 2) {
      const pathResult = validateOrDiscoverPath(
        context.graph,
        detectedCitations[0].fileId,
        detectedCitations[1].fileId,
      );
      if (pathResult.isValid && pathResult.trace) {
        yield { type: "trace", trace: pathResult.trace };
      }
    }

    if (detectedCitations.length > 0) {
      yield { type: "citations", citations: Object.freeze(detectedCitations) };
    }

    yield { type: "done" };
  }
}
