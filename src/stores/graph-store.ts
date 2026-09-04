import { create } from "zustand";
import {
  type Repository,
  type CodebaseGraph,
  createFileId,
  createSymbolId,
} from "@/entities";
import type {
  IngestionPhase,
  IngestRequest,
  IngestError,
  IngestProgress,
  IngestStreamEvent,
} from "@/types/ingestion";

export type NavigationSource = "canvas" | "editor" | "url" | "search";

export interface NavigationTarget {
  readonly fileId: string;
  readonly symbolId?: string | null;
  readonly line?: number | null;
  readonly column?: number | null;
  readonly source: NavigationSource;
  readonly timestamp: number;
}

export interface DeepLinkState {
  readonly activeTarget: NavigationTarget | null;
  readonly lockedUntil: number;
  readonly pendingTarget: NavigationTarget | null;
  readonly lastProgrammaticTarget: {
    readonly fileId: string;
    readonly line: number;
  } | null;
}

export interface DeepLinkUrlParams {
  readonly repo?: string;
  readonly branch?: string;
  readonly file?: string;
  readonly line?: string;
  readonly symbol?: string;
}

export interface FlushResult {
  readonly success: boolean;
  readonly fallbackReason?: string;
}

export interface GraphStoreState extends DeepLinkState {
  readonly repository: Repository | null;
  readonly graph: CodebaseGraph | null;
  readonly fileSources: Readonly<Record<string, string>>;
  readonly selectedNodeId: string | null;
  readonly selectedFileId: string | null;
  readonly ingestionPhase: IngestionPhase;
  readonly ingestionProgress: IngestProgress | null;
  readonly ingestionError: IngestError | null;
  readonly isIngesting: boolean;
  readonly fallbackNotification: string | null;
}

export interface GraphStoreActions {
  readonly startIngestion: (request: IngestRequest) => Promise<void>;
  readonly cancelIngestion: () => void;
  readonly selectNode: (nodeId: string | null) => void;
  readonly setGraph: (
    graph: CodebaseGraph,
    fileSources?: Record<string, string>,
  ) => void;
  readonly navigateToTarget: (target: NavigationTarget) => void;
  readonly bufferDeepLink: (params: DeepLinkUrlParams) => void;
  readonly flushPendingDeepLink: () => FlushResult;
  readonly isNavigationLocked: (fileId?: string, line?: number) => boolean;
  readonly clearActiveTarget: () => void;
  readonly clearFallbackNotification: () => void;
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
  activeTarget: null,
  lockedUntil: 0,
  pendingTarget: null,
  lastProgrammaticTarget: null,
  fallbackNotification: null,
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
              get().flushPendingDeepLink();
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
      set({ selectedNodeId: null, selectedFileId: null, activeTarget: null });
      return;
    }

    if (nodeId.startsWith("file:")) {
      const target: NavigationTarget = {
        fileId: nodeId,
        source: "canvas",
        timestamp: Date.now(),
      };
      set({
        selectedNodeId: nodeId,
        selectedFileId: nodeId,
        activeTarget: target,
        lockedUntil: Date.now() + 300,
        lastProgrammaticTarget: null,
      });
      return;
    }

    if (nodeId.startsWith("symbol:")) {
      const graph = get().graph;
      const symbol = graph?.symbols[nodeId];
      const fileId = symbol?.fileId ?? null;
      const target: NavigationTarget | null = fileId
        ? {
            fileId,
            symbolId: nodeId,
            line: symbol?.range.startLine ?? null,
            column: symbol?.range.startColumn ?? null,
            source: "canvas",
            timestamp: Date.now(),
          }
        : null;
      set({
        selectedNodeId: nodeId,
        selectedFileId: fileId,
        activeTarget: target,
        lockedUntil: Date.now() + 300,
        lastProgrammaticTarget:
          fileId && symbol?.range.startLine != null
            ? { fileId, line: symbol.range.startLine }
            : null,
      });
      return;
    }

    // Directory or external module
    set({ selectedNodeId: nodeId, selectedFileId: null, activeTarget: null });
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
    get().flushPendingDeepLink();
  },

  navigateToTarget: (target: NavigationTarget): void => {
    const now = Date.now();
    const state = get();

    // If source is editor cursor, apply dual-guard check to prevent reverse loop
    if (target.source === "editor") {
      if (now < state.lockedUntil) {
        return;
      }
      if (
        state.lastProgrammaticTarget &&
        state.lastProgrammaticTarget.fileId === target.fileId &&
        target.line != null &&
        state.lastProgrammaticTarget.line === target.line
      ) {
        return;
      }
    }

    const isProgrammatic = target.source !== "editor";
    const newLock = isProgrammatic ? now + 300 : now + 150;
    const newProgrammaticTarget =
      isProgrammatic && target.line != null
        ? { fileId: target.fileId, line: target.line }
        : null;

    set({
      activeTarget: target,
      selectedFileId: target.fileId,
      selectedNodeId: target.symbolId ?? target.fileId,
      lockedUntil: newLock,
      lastProgrammaticTarget: newProgrammaticTarget,
    });
  },

  bufferDeepLink: (params: DeepLinkUrlParams): void => {
    if (!params.file && !params.symbol) {
      return;
    }

    const cleanFile = params.file?.trim();
    const fileId = cleanFile
      ? cleanFile.startsWith("file:")
        ? cleanFile
        : createFileId(cleanFile)
      : "";

    const lineNum = params.line ? parseInt(params.line, 10) : null;
    const validLine =
      lineNum && Number.isFinite(lineNum) && lineNum > 0 ? lineNum : null;

    let symbolId: string | null = null;
    if (params.symbol?.trim()) {
      const sym = params.symbol.trim();
      symbolId = sym.startsWith("symbol:")
        ? sym
        : cleanFile
          ? createSymbolId(cleanFile, sym)
          : null;
    }

    const pending: NavigationTarget = {
      fileId,
      symbolId,
      line: validLine,
      source: "url",
      timestamp: Date.now(),
    };

    set({ pendingTarget: pending });
  },

  flushPendingDeepLink: (): FlushResult => {
    const state = get();
    const pending = state.pendingTarget;
    if (!pending) {
      return { success: true };
    }

    const graph = state.graph;
    if (!graph) {
      return { success: false, fallbackReason: "Graph not loaded" };
    }

    if (!pending.fileId) {
      set({ pendingTarget: null });
      return { success: true };
    }

    const fileExists = Boolean(graph.files[pending.fileId]);
    const altFileId = pending.fileId.startsWith("file:")
      ? pending.fileId
      : `file:${pending.fileId}`;
    const resolvedFileId = fileExists
      ? pending.fileId
      : graph.files[altFileId]
        ? altFileId
        : null;

    if (!resolvedFileId) {
      const reason = `File "${pending.fileId.replace(/^file:/, "")}" was not found in the parsed repository.`;
      set({
        pendingTarget: null,
        activeTarget: null,
        fallbackNotification: reason,
      });
      return {
        success: false,
        fallbackReason: reason,
      };
    }

    let resolvedSymbolId = pending.symbolId;
    let targetLine = pending.line;

    if (resolvedSymbolId && !graph.symbols[resolvedSymbolId]) {
      const symbolName = resolvedSymbolId.split("#")[1] || "";
      const matched = Object.values(graph.symbols).find(
        (s) => s.fileId === resolvedFileId && s.name === symbolName,
      );
      if (matched) {
        resolvedSymbolId = matched.id;
        if (targetLine == null) {
          targetLine = matched.range.startLine;
        }
      } else {
        const reason = `Symbol "${symbolName}" was not found in ${resolvedFileId.replace(/^file:/, "")}.`;
        set({
          pendingTarget: null,
          fallbackNotification: reason,
        });
        return {
          success: false,
          fallbackReason: reason,
        };
      }
    } else if (
      resolvedSymbolId &&
      graph.symbols[resolvedSymbolId] &&
      targetLine == null
    ) {
      targetLine = graph.symbols[resolvedSymbolId].range.startLine;
    }

    const resolvedTarget: NavigationTarget = {
      fileId: resolvedFileId,
      symbolId: resolvedSymbolId,
      line: targetLine,
      column: pending.column ?? 1,
      source: "url",
      timestamp: Date.now(),
    };

    set({ pendingTarget: null });
    get().navigateToTarget(resolvedTarget);

    return { success: true };
  },

  isNavigationLocked: (fileId?: string, line?: number): boolean => {
    const now = Date.now();
    const state = get();
    if (now < state.lockedUntil) {
      return true;
    }
    if (
      fileId &&
      line != null &&
      state.lastProgrammaticTarget &&
      state.lastProgrammaticTarget.fileId === fileId &&
      state.lastProgrammaticTarget.line === line
    ) {
      return true;
    }
    return false;
  },

  clearActiveTarget: (): void => {
    set({ activeTarget: null });
  },

  clearFallbackNotification: (): void => {
    set({ fallbackNotification: null });
  },

  reset: (): void => {
    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }
    set(initialState);
  },
}));
