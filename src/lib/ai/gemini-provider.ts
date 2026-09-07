import type {
  AIProvider,
  AIRequestContext,
  AIStreamEvent,
  CitationRef,
} from "./types";
import { validateOrDiscoverPath } from "@/graph/path-validation";

/**
 * Gemini Flash provider implementing streaming queries and tool calling.
 */
export class GeminiAIProvider implements AIProvider {
  readonly id = "gemini" as const;
  readonly name = "Google Gemini Flash";

  async *streamQuery(
    messages: readonly {
      readonly role: "user" | "assistant" | "system";
      readonly content: string;
    }[],
    context: AIRequestContext,
    apiKey?: string,
    signal?: AbortSignal,
  ): AsyncGenerator<AIStreamEvent, void, unknown> {
    const activeKey = apiKey || process.env.GEMINI_API_KEY;
    if (!activeKey) {
      yield {
        type: "error",
        error:
          "Missing Gemini API key. Please configure a key in Key Settings or use Demo Mode.",
      };
      return;
    }

    const systemInstruction = `You are an expert software architect analyzing the codebase "${context.repository.fullName}".
Analyze the provided repository context and answer the user's architectural question concisely.
If a dependency path between files is asked or identified, mention the path in your response.
Context Summary:
${context.contextSummary}`;

    const formattedContents = messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse&key=${activeKey}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: systemInstruction }],
          },
          contents: formattedContents,
        }),
        signal,
      });
    } catch (err) {
      yield {
        type: "error",
        error:
          err instanceof Error
            ? err.message
            : "Failed to connect to Google Gemini API.",
      };
      return;
    }

    if (!response.ok) {
      const errorText = await response.text();
      yield {
        type: "error",
        error: `Gemini API returned HTTP ${response.status}: ${errorText}`,
      };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      yield { type: "error", error: "Empty response body from Gemini API." };
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
            const data = JSON.parse(jsonStr) as {
              candidates?: Array<{
                content?: {
                  parts?: Array<{ text?: string }>;
                };
              }>;
            };

            const chunkText =
              data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
            if (chunkText) {
              accumulatedText += chunkText;
              yield { type: "text", text: chunkText };
            }
          } catch {
            // Ignore unparseable chunks
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Post-process accumulated text for citations and path verification
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
