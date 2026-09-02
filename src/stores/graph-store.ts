import { create } from "zustand";
import type { Repository, CodebaseGraph } from "@/entities";
import type {
  IngestionPhase,
  IngestRequest,
  IngestError,
  IngestProgress,
  IngestStreamEvent,
} from "@/types/ingestion";

export interface GraphStoreState {
  readonly repository: Repository | null;
  readonly graph: CodebaseGraph | null;
  readonly fileSources: Readonly<Record<string, string>>;
  readonly selectedNodeId: string | null;
  readonly selectedFileId: string | null;
  readonly ingestionPhase: IngestionPhase;
  readonly ingestionProgress: IngestProgress | null;
  readonly ingestionError: IngestError | null;
  readonly isIngesting: boolean;
}

export interface GraphStoreActions {
  readonly startIngestion: (request: IngestRequest) => Promise<void>;
  readonly cancelIngestion: () => void;
  readonly selectNode: (nodeId: string | null) => void;
  readonly setGraph: (
    graph: CodebaseGraph,
    fileSources?: Record<string, string>,
  ) => void;
  readonly reset: () => void;
}

export type GraphStore = GraphStoreState & GraphStoreActions;

const initialState: GraphStoreState = {
  repository: null,
  graph: null,
  fileSources: Object.freeze({}),
  selectedNodeId: null,
  selectedFileId: null,
  ingestionPhase: "idle",
  ingestionProgress: null,
  ingestionError: null,
  isIngesting: false,
};

let activeAbortController: AbortController | null = null;

export const useGraphStore = create<GraphStore>((set, get) => ({
  ...initialState,

  startIngestion: async (request: IngestRequest): Promise<void> => {
    // Abort existing in flight ingestion
    if (activeAbortController) {
      activeAbortController.abort();
    }

    const abortController = new AbortController();
    activeAbortController = abortController;

    set({
      isIngesting: true,
      ingestionPhase: "validating",
      ingestionError: null,
      ingestionProgress: {
        phase: "validating",
        current: 0,
        total: 100,
        message: "Initiating repository ingestion...",
      },
    });

    try {
      const response = await fetch("/api/ingest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
        signal: abortController.signal,
      });

      if (!response.ok) {
        let errorPayload: IngestError = {
          code: "PARSE_FAILED",
          message: `Ingestion failed with HTTP ${response.status}`,
        };
        try {
          const jsonErr = (await response.json()) as {
            code?: string;
            message?: string;
          };
          if (jsonErr.message) {
            errorPayload = {
              code: (jsonErr.code as IngestError["code"]) || "PARSE_FAILED",
              message: jsonErr.message,
            };
          }
        } catch {
          // Use default error payload
        }

        set({
          isIngesting: false,
          ingestionPhase: "error",
          ingestionError: errorPayload,
        });
        return;
      }

      if (!response.body) {
        set({
          isIngesting: false,
          ingestionPhase: "error",
          ingestionError: {
            code: "PARSE_FAILED",
            message: "Empty response body from ingestion stream.",
          },
        });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) {
            continue;
          }

          const jsonPayload = trimmed.slice(5).trim();
          if (!jsonPayload) {
            continue;
          }

          try {
            const event = JSON.parse(jsonPayload) as IngestStreamEvent;

            if (event.phase === "error") {
              set({
                isIngesting: false,
                ingestionPhase: "error",
                ingestionError: event.error || {
                  code: "PARSE_FAILED",
                  message: "Repository ingestion encountered an error.",
                },
              });
            } else if (event.phase === "complete" && event.result) {
              set({
                isIngesting: false,
                ingestionPhase: "complete",
                repository: event.result.repository,
                graph: event.result.graph,
                fileSources: Object.freeze(event.result.fileSources),
                ingestionProgress: event.progress ?? null,
              });
            } else {
              set({
                ingestionPhase: event.phase,
                ingestionProgress: event.progress ?? null,
              });
            }
          } catch {
            // Tolerate unparseable stream chunks
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        set({
          isIngesting: false,
          ingestionPhase: "idle",
        });
        return;
      }

      set({
        isIngesting: false,
        ingestionPhase: "error",
        ingestionError: {
          code: "TIMEOUT",
          message:
            err instanceof Error
              ? err.message
              : "Network connection lost during ingestion.",
        },
      });
    } finally {
      if (activeAbortController === abortController) {
        activeAbortController = null;
      }
    }
  },

  cancelIngestion: (): void => {
    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }
    set({
      isIngesting: false,
      ingestionPhase: "idle",
    });
  },

  selectNode: (nodeId: string | null): void => {
    if (!nodeId) {
      set({ selectedNodeId: null, selectedFileId: null });
      return;
    }

    if (nodeId.startsWith("file:")) {
      set({ selectedNodeId: nodeId, selectedFileId: nodeId });
      return;
    }

    if (nodeId.startsWith("symbol:")) {
      const graph = get().graph;
      const symbol = graph?.symbols[nodeId];
      set({
        selectedNodeId: nodeId,
        selectedFileId: symbol?.fileId ?? null,
      });
      return;
    }

    // Directory or external module
    set({ selectedNodeId: nodeId, selectedFileId: null });
  },

  setGraph: (
    graph: CodebaseGraph,
    fileSources: Record<string, string> = {},
  ): void => {
    set({
      graph,
      repository: graph.repository,
      fileSources: Object.freeze(fileSources),
      ingestionPhase: "complete",
      isIngesting: false,
      ingestionError: null,
    });
  },

  reset: (): void => {
    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }
    set(initialState);
  },
}));
