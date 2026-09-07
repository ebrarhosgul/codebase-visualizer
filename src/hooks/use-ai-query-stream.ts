import { useState, useRef, useCallback } from "react";
import type { AIStreamEvent, AiProviderId, CitationRef } from "@/lib/ai/types";
import type { CodebaseGraph, PathTrace, Repository } from "@/entities";

export interface StreamQueryOptions {
  readonly repository: Repository;
  readonly graph: CodebaseGraph;
  readonly contextSummary: string;
  readonly messages: readonly {
    readonly role: "user" | "assistant" | "system";
    readonly content: string;
  }[];
  readonly isDemo?: boolean;
  readonly provider?: AiProviderId;
  readonly onTextChunk?: (chunk: string) => void;
  readonly onTrace?: (trace: PathTrace) => void;
  readonly onCitations?: (citations: readonly CitationRef[]) => void;
  readonly onWarning?: (warning: string) => void;
  readonly onError?: (error: string) => void;
  readonly onComplete?: () => void;
}

export interface UseAiQueryStreamReturn {
  readonly isStreaming: boolean;
  readonly streamQuery: (options: StreamQueryOptions) => Promise<void>;
  readonly abortQuery: () => void;
}

/**
 * Custom hook for sending streaming queries to /api/ai/query with cancellation support.
 */
export function useAiQueryStream(): UseAiQueryStreamReturn {
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const abortQuery = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsStreaming(false);
    }
  }, []);

  const streamQuery = useCallback(
    async (options: StreamQueryOptions): Promise<void> => {
      // Abort any ongoing query before launching a new one
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;
      setIsStreaming(true);

      try {
        const response = await fetch("/api/ai/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            repository: options.repository,
            graph: options.graph,
            contextSummary: options.contextSummary,
            messages: options.messages,
            isDemo: options.isDemo ?? false,
            provider: options.provider ?? "gemini",
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          let errorMessage = `Server error ${response.status}`;
          try {
            const errJson = (await response.json()) as { error?: string };
            if (errJson.error) {
              errorMessage = errJson.error;
            }
          } catch {
            // Non-JSON error body
          }
          options.onError?.(errorMessage);
          setIsStreaming(false);
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          options.onError?.("No response stream available.");
          setIsStreaming(false);
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";

        try {
          while (true) {
            if (controller.signal.aborted) break;
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data:")) continue;
              const jsonPayload = trimmed.slice(5).trim();
              if (!jsonPayload) continue;

              try {
                const event = JSON.parse(jsonPayload) as AIStreamEvent;
                switch (event.type) {
                  case "text":
                    options.onTextChunk?.(event.text);
                    break;
                  case "trace":
                    options.onTrace?.(event.trace);
                    break;
                  case "citations":
                    options.onCitations?.(event.citations);
                    break;
                  case "warning":
                    options.onWarning?.(event.message);
                    break;
                  case "error":
                    options.onError?.(event.error);
                    break;
                  case "done":
                    options.onComplete?.();
                    break;
                }
              } catch {
                // Ignore malformed chunks
              }
            }
          }
        } finally {
          reader.releaseLock();
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          // Normal abort requested by user
          return;
        }
        options.onError?.(
          err instanceof Error
            ? err.message
            : "Failed to communicate with AI query server.",
        );
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
        setIsStreaming(false);
        options.onComplete?.();
      }
    },
    [],
  );

  return {
    isStreaming,
    streamQuery,
    abortQuery,
  };
}
