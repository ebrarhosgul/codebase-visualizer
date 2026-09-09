import { useState, useRef, useCallback } from "react";
import type {
  AIStreamEvent,
  AiFallbackNotice,
  AiProviderId,
  CitationRef,
} from "@/lib/ai/types";
import type { CodebaseGraph, PathTrace, Repository } from "@/entities";
import { classifyError } from "@/lib/ai/error-classifier";
import { DemoAIProvider } from "@/lib/ai/demo-provider";

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
  readonly onErrorNotice?: (notice: AiFallbackNotice) => void;
  readonly onComplete?: () => void;
}

export interface UseAiQueryStreamReturn {
  readonly isStreaming: boolean;
  readonly streamQuery: (options: StreamQueryOptions) => Promise<void>;
  readonly retryLastQuery: () => Promise<void>;
  readonly abortQuery: () => void;
  readonly lastQueryOptionsRef: React.RefObject<StreamQueryOptions | null>;
}

/**
 * Custom hook for sending streaming queries with error classification and zero network offline demo support.
 */
export function useAiQueryStream(): UseAiQueryStreamReturn {
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastQueryOptionsRef = useRef<StreamQueryOptions | null>(null);

  const abortQuery = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsStreaming(false);
    }
  }, []);

  const streamQuery = useCallback(
    async (options: StreamQueryOptions): Promise<void> => {
      // Save options for auto retry and recovery flows
      lastQueryOptionsRef.current = options;

      // Abort any ongoing query before launching a new one
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;
      setIsStreaming(true);

      const isBrowserOffline =
        typeof navigator !== "undefined" &&
        typeof navigator.onLine === "boolean" &&
        !navigator.onLine;

      const isDemoMode =
        options.isDemo || options.provider === ("demo" as AiProviderId);

      // Offline demo execution: zero network calls when browser is offline
      if (isDemoMode && isBrowserOffline) {
        try {
          const demoProvider = new DemoAIProvider();
          const generator = demoProvider.streamQuery(
            options.messages,
            {
              repository: options.repository,
              contextSummary: options.contextSummary,
              graph: options.graph,
            },
            undefined,
            controller.signal,
          );

          for await (const event of generator) {
            if (controller.signal.aborted) break;
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
              case "error": {
                const notice = classifyError({
                  message: event.error,
                  provider: "demo",
                });
                options.onErrorNotice?.(notice);
                options.onError?.(notice.message);
                break;
              }
              case "done":
                options.onComplete?.();
                break;
            }
          }
        } catch (err: unknown) {
          if (err instanceof Error && err.name === "AbortError") {
            return;
          }
          const notice = classifyError({
            error: err,
            provider: "demo",
          });
          options.onErrorNotice?.(notice);
          options.onError?.(notice.message);
        } finally {
          if (abortControllerRef.current === controller) {
            abortControllerRef.current = null;
          }
          setIsStreaming(false);
          options.onComplete?.();
        }
        return;
      }

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
          let fallbackNotice: AiFallbackNotice | undefined;
          let retrySeconds: number | undefined;

          const retryHeader = response.headers.get("Retry-After");
          if (retryHeader) {
            const parsed = parseInt(retryHeader, 10);
            if (!Number.isNaN(parsed)) retrySeconds = parsed;
          }

          try {
            const errJson = (await response.json()) as {
              error?: string;
              fallbackNotice?: AiFallbackNotice;
              retryAfterSeconds?: number;
            };
            if (errJson.error) {
              errorMessage = errJson.error;
            }
            if (errJson.fallbackNotice) {
              fallbackNotice = errJson.fallbackNotice;
            }
            if (errJson.retryAfterSeconds) {
              retrySeconds = errJson.retryAfterSeconds;
            }
          } catch {
            // Non JSON error body
          }

          const notice =
            fallbackNotice ??
            classifyError({
              status: response.status,
              message: errorMessage,
              provider: options.provider,
              retryAfterSeconds: retrySeconds,
            });

          options.onErrorNotice?.(notice);
          options.onError?.(errorMessage);
          setIsStreaming(false);
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          const defaultMsg = "No response stream available from server.";
          const notice = classifyError({
            message: defaultMsg,
            provider: options.provider,
          });
          options.onErrorNotice?.(notice);
          options.onError?.(defaultMsg);
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
                  case "error": {
                    const notice =
                      event.fallbackNotice ??
                      classifyError({
                        message: event.error,
                        code: event.code,
                        suggestedAction: event.suggestedAction,
                        retryAfterSeconds: event.retryAfterSeconds,
                        provider: options.provider,
                      });
                    options.onErrorNotice?.(notice);
                    options.onError?.(event.error);
                    break;
                  }
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
          // Normal abort requested by caller
          return;
        }
        const errorText =
          err instanceof Error
            ? err.message
            : "Failed to communicate with AI query server.";
        const notice = classifyError({
          error: err,
          message: errorText,
          provider: options.provider,
        });
        options.onErrorNotice?.(notice);
        options.onError?.(errorText);
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

  const retryLastQuery = useCallback(async (): Promise<void> => {
    if (lastQueryOptionsRef.current) {
      await streamQuery(lastQueryOptionsRef.current);
    }
  }, [streamQuery]);

  return {
    isStreaming,
    streamQuery,
    retryLastQuery,
    abortQuery,
    lastQueryOptionsRef,
  };
}
