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
Format your response in clean Markdown. Do not use LaTeX or TeX math markup (such as $, $$, \\frac, \\Delta, \\theta, \\times, or \\text{}). Express all formulas, algorithms, calculations, and mathematical symbols using clean plain text, unicode characters (e.g., Δt, θ, ×, ·), or standard code blocks/inline code (e.g., \`delta_t = t_current - t_last\`).
If a dependency path between files is asked or identified, mention the path in your response.
Context Summary:
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
        error: "No valid user message provided to Gemini API.",
      };
      return;
    }

    const formattedContents: Array<{
      role: "user" | "model";
      parts: Array<{ text: string }>;
    }> = [];

    for (const m of validMessages) {
      const role = m.role === "assistant" ? "model" : "user";
      const last = formattedContents[formattedContents.length - 1];
      if (last && last.role === role) {
        last.parts.push({ text: m.content });
      } else {
        formattedContents.push({
          role,
          parts: [{ text: m.content }],
        });
      }
    }

    const configuredModel =
      process.env.GEMINI_MODEL?.trim() || "gemini-3.6-flash";
    const model = configuredModel.startsWith("models/")
      ? configuredModel.slice("models/".length)
      : configuredModel;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${activeKey}`;

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
      let parsedMessage = errorText;
      try {
        const errorJson = JSON.parse(errorText) as {
          error?: { message?: string };
        };
        if (errorJson.error?.message) {
          parsedMessage = errorJson.error.message;
        }
      } catch {
        // Fall back to raw error text if not JSON
      }
      yield {
        type: "error",
        error: `Gemini API returned HTTP ${response.status}: ${parsedMessage}`,
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
