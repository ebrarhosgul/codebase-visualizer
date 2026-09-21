import type {
  AIProvider,
  AIRequestContext,
  AIStreamEvent,
  CitationRef,
} from "./types";
import { validateOrDiscoverPath } from "@/graph/path-validation";

/**
 * Anthropic Claude provider with streaming messages API.
 */
export class ClaudeProvider implements AIProvider {
  readonly id = "claude" as const;
  readonly name = "Anthropic Claude";

  async *streamQuery(
    messages: readonly {
      readonly role: "user" | "assistant" | "system";
      readonly content: string;
    }[],
    context: AIRequestContext,
    apiKey?: string,
    signal?: AbortSignal,
  ): AsyncGenerator<AIStreamEvent, void, unknown> {
    // Only the caller supplied key is used; there is no server side fallback.
    const activeKey = apiKey;
    if (!activeKey) {
      yield {
        type: "error",
        error:
          "Missing Anthropic API key. Please configure a key in Key Settings or use Demo Mode.",
      };
      return;
    }

    const systemPrompt = `You are an expert software architect analyzing the codebase "${context.repository.fullName}".
Analyze the repository context and provide clear architectural answers:
Format your response in clean Markdown. Do not use LaTeX or TeX math markup (such as $, $$, \\frac, \\Delta, \\theta, \\times, or \\text{}). Express all formulas, algorithms, calculations, and mathematical symbols using clean plain text, unicode characters (e.g., Δt, θ, ×, ·), or standard code blocks/inline code (e.g., \`delta_t = t_current - t_last\`).
${context.contextSummary}`;

    const validMessages = messages.filter(
      (m) =>
        (m.role === "user" || m.role === "assistant") &&
        m.content.trim().length > 0,
    );
    while (
      validMessages.length > 0 &&
      validMessages[validMessages.length - 1].role === "assistant"
    ) {
      validMessages.pop();
    }

    if (validMessages.length === 0) {
      yield {
        type: "error",
        error: "No valid user message provided to Claude API.",
      };
      return;
    }

    const formattedMessages = validMessages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    let response: Response;
    try {
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": activeKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-5-haiku-20241022",
          max_tokens: 2048,
          system: systemPrompt,
          stream: true,
          messages: formattedMessages,
        }),
        signal,
      });
    } catch (err) {
      yield {
        type: "error",
        error:
          err instanceof Error
            ? err.message
            : "Failed to connect to Anthropic API.",
      };
      return;
    }

    if (!response.ok) {
      const errorText = await response.text();
      yield {
        type: "error",
        error: `Anthropic API returned HTTP ${response.status}: ${errorText}`,
      };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      yield { type: "error", error: "Empty response body from Anthropic API." };
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
          if (!jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr) as {
              type?: string;
              delta?: { type?: string; text?: string };
            };
            if (
              event.type === "content_block_delta" &&
              event.delta?.type === "text_delta" &&
              event.delta.text
            ) {
              accumulatedText += event.delta.text;
              yield { type: "text", text: event.delta.text };
            }
          } catch {
            // Ignore unparseable lines
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
