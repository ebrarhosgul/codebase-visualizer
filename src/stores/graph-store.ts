import { create } from "zustand";
import {
  type Repository,
  type CodebaseGraph,
  type PathTrace,
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
import {
  type ArchitecturalLayerId,
  classifyLayerForPath,
} from "@/graph/layers";
import { parseGithubUrl } from "@/lib/github";
import {
  clearAllCachedRepositories,
  getCachedRepository,
  saveCachedRepository,
  type CachedRepositoryRecord,
} from "@/lib/storage";

export type NavigationSource = "canvas" | "editor" | "url" | "search" | "tree";

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

export interface GraphFilterState {
  readonly selectedLayers: readonly ArchitecturalLayerId[];
  readonly collapsedFolderIds: readonly string[];
  readonly searchQuery: string;
  readonly hideExternal: boolean;
}

export interface ActiveTraceState {
  readonly activeTrace: PathTrace | null;
  readonly activeStepIndex: number | null;
  readonly highlightedNodeIds: readonly string[];
  readonly highlightedEdgeIds: readonly string[];
}

export interface GraphStoreState
  extends DeepLinkState, GraphFilterState, ActiveTraceState {
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
  readonly hoveredNodeId: string | null;
  readonly isCacheHit: boolean;
  readonly offlineFallback: boolean;
  readonly offlineLastSynced: number | null;
  readonly rateLimitModalOpen: boolean;
  readonly rateLimitReset: number | null;
  readonly pendingRateLimitedRequest: IngestRequest | null;
  readonly hasGithubToken: boolean;
  readonly isCalculatingLayout: boolean;
  readonly layoutDurationMs: number | null;
}

export interface GraphStoreActions {
  readonly startIngestion: (request: IngestRequest) => Promise<void>;
  readonly cancelIngestion: () => void;
  readonly forceReingest: () => Promise<void>;
  readonly setRateLimitModalOpen: (open: boolean) => void;
  readonly retryAfterRateLimit: () => Promise<void>;
  readonly migrateLegacyToken: () => Promise<void>;
  readonly checkTokenStatus: () => Promise<void>;
  readonly clearGithubToken: () => Promise<void>;
  readonly selectNode: (
    nodeId: string | null,
    source?: NavigationSource,
  ) => void;
  readonly setHoveredNodeId: (nodeId: string | null) => void;
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
  readonly toggleLayerFilter: (layerId: ArchitecturalLayerId) => void;
  readonly setLayerFilters: (layerIds: readonly ArchitecturalLayerId[]) => void;
  readonly clearLayerFilters: () => void;
  readonly toggleFolderCollapse: (folderId: string) => void;
  readonly collapseAllFolders: () => void;
  readonly expandAllFolders: () => void;
  readonly setSearchQuery: (query: string) => void;
  readonly toggleHideExternal: () => void;
  readonly resetAllFilters: () => void;
  readonly revealNode: (nodeId: string, source?: NavigationSource) => void;
  readonly setActiveTrace: (trace: PathTrace | null) => void;
  readonly focusTraceStep: (stepIndex: number | null) => void;
  readonly clearTrace: () => void;
  readonly setLayoutCalculationState: (
    isCalculating: boolean,
    durationMs?: number | null,
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
  activeTarget: null,
  lockedUntil: 0,
  pendingTarget: null,
  lastProgrammaticTarget: null,
  fallbackNotification: null,
  hoveredNodeId: null,
  selectedLayers: Object.freeze([]),
  collapsedFolderIds: Object.freeze([]),
  searchQuery: "",
  hideExternal: false,
  activeTrace: null,
  activeStepIndex: null,
  highlightedNodeIds: Object.freeze([]),
  highlightedEdgeIds: Object.freeze([]),
  isCacheHit: false,
  offlineFallback: false,
  offlineLastSynced: null,
  rateLimitModalOpen: false,
  rateLimitReset: null,
  pendingRateLimitedRequest: null,
  hasGithubToken: false,
  isCalculatingLayout: false,
  layoutDurationMs: null,
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
      isCacheHit: false,
      offlineFallback: false,
      offlineLastSynced: null,
      ingestionProgress: {
        phase: "validating",
        current: 0,
        total: 100,
        message: "Initiating repository ingestion...",
      },
    });

    // Check local IndexedDB cache before network call (AC-1, AC-2)
    const parsed = parseGithubUrl(request.repositoryUrl);
    const owner = parsed.success ? parsed.data.owner : "";
    const repo = parsed.success ? parsed.data.repo : "";
    const targetBranch =
      request.branch ||
      (parsed.success ? parsed.data.branch : undefined) ||
      "main";

    let localCachedRecord: CachedRepositoryRecord | null = null;
    if (parsed.success && !request.forceFresh) {
      try {
        localCachedRecord = await getCachedRepository(
          owner,
          repo,
          targetBranch,
        );
      } catch {
        localCachedRecord = null;
      }
    }

    const enhancedRequest: IngestRequest = {
      ...request,
      cachedCommitSha: localCachedRecord?.commitSha ?? request.cachedCommitSha,
    };

    try {
      const response = await fetch("/api/ingest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(enhancedRequest),
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
            rateLimitReset?: number;
          };
          if (jsonErr.message) {
            errorPayload = {
              code: (jsonErr.code as IngestError["code"]) || "PARSE_FAILED",
              message: jsonErr.message,
              rateLimitReset: jsonErr.rateLimitReset,
            };
          }
        } catch {
          // Use default error payload
        }

        if (errorPayload.code === "RATE_LIMITED") {
          set({
            rateLimitModalOpen: true,
            rateLimitReset: errorPayload.rateLimitReset ?? null,
            pendingRateLimitedRequest: request,
          });
        }

        // Offline fallback check on API failure (AC-8)
        if (localCachedRecord) {
          set({
            isIngesting: false,
            ingestionPhase: "complete",
            repository: localCachedRecord.graph.repository,
            graph: localCachedRecord.graph,
            fileSources: Object.freeze(localCachedRecord.fileSources),
            isCacheHit: true,
            offlineFallback: true,
            offlineLastSynced: localCachedRecord.lastAccessedAt,
            ingestionProgress: {
              phase: "complete",
              current: 100,
              total: 100,
              message:
                "GitHub API unreachable. Loaded from local offline cache.",
            },
          });
          get().flushPendingDeepLink();
          return;
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
              if (event.error?.code === "RATE_LIMITED") {
                set({
                  rateLimitModalOpen: true,
                  rateLimitReset: event.error.rateLimitReset ?? null,
                  pendingRateLimitedRequest: request,
                });
              }
              set({
                isIngesting: false,
                ingestionPhase: "error",
                ingestionError: event.error || {
                  code: "PARSE_FAILED",
                  message: "Repository ingestion encountered an error.",
                },
              });
            } else if (event.phase === "complete" && event.cached === true) {
              // Cache hit from upstream commit verification (AC-1, AC-2)
              const recordToHydrate =
                localCachedRecord ||
                (parsed.success
                  ? await getCachedRepository(owner, repo, targetBranch)
                  : null);

              if (recordToHydrate) {
                set({
                  isIngesting: false,
                  ingestionPhase: "complete",
                  repository: recordToHydrate.graph.repository,
                  graph: recordToHydrate.graph,
                  fileSources: Object.freeze(recordToHydrate.fileSources),
                  isCacheHit: true,
                  offlineFallback: false,
                  offlineLastSynced: null,
                  ingestionProgress: {
                    phase: "complete",
                    current: 100,
                    total: 100,
                    message: "Loaded from client cache (commit verified).",
                  },
                  activeTrace: null,
                  activeStepIndex: null,
                  highlightedNodeIds: Object.freeze([]),
                  highlightedEdgeIds: Object.freeze([]),
                });
                get().flushPendingDeepLink();
              } else {
                // If record unexpectedly absent, re-trigger fresh fetch
                await get().startIngestion({
                  ...request,
                  forceFresh: true,
                });
              }
            } else if (event.phase === "complete" && event.result) {
              const resultGraph = event.result.graph;
              const resultFileSources = event.result.fileSources;
              const resultRepo = event.result.repository;

              set({
                isIngesting: false,
                ingestionPhase: "complete",
                repository: resultRepo,
                graph: resultGraph,
                fileSources: Object.freeze(resultFileSources),
                isCacheHit: false,
                offlineFallback: false,
                offlineLastSynced: null,
                ingestionProgress: event.progress ?? null,
                activeTrace: null,
                activeStepIndex: null,
                highlightedNodeIds: Object.freeze([]),
                highlightedEdgeIds: Object.freeze([]),
              });
              get().flushPendingDeepLink();

              // Save to IndexedDB asynchronously with LRU eviction (AC-1, AC-7)
              if (parsed.success) {
                saveCachedRepository({
                  owner,
                  repo,
                  branch: targetBranch,
                  commitSha: event.commitSha || resultRepo.commitSha,
                  graph: resultGraph,
                  fileSources: resultFileSources,
                }).catch(() => {
                  // Tolerate storage failure in private modes
                });
              }
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

      // Offline fallback on network disconnection (AC-8)
      if (localCachedRecord) {
        set({
          isIngesting: false,
          ingestionPhase: "complete",
          repository: localCachedRecord.graph.repository,
          graph: localCachedRecord.graph,
          fileSources: Object.freeze(localCachedRecord.fileSources),
          isCacheHit: true,
          offlineFallback: true,
          offlineLastSynced: localCachedRecord.lastAccessedAt,
          ingestionProgress: {
            phase: "complete",
            current: 100,
            total: 100,
            message: "Network offline. Loaded from local offline cache.",
          },
        });
        get().flushPendingDeepLink();
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

  forceReingest: async (): Promise<void> => {
    const repo = get().repository;
    if (!repo) {
      return;
    }
    const url = `https://github.com/${repo.fullName}`;
    await get().startIngestion({
      repositoryUrl: url,
      branch: repo.defaultBranch,
      forceFresh: true,
    });
  },

  setRateLimitModalOpen: (open: boolean): void => {
    set({ rateLimitModalOpen: open });
  },

  retryAfterRateLimit: async (): Promise<void> => {
    const pending = get().pendingRateLimitedRequest;
    set({
      rateLimitModalOpen: false,
      pendingRateLimitedRequest: null,
    });
    if (pending) {
      await get().startIngestion(pending);
    }
  },

  migrateLegacyToken: async (): Promise<void> => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      const legacy = sessionStorage.getItem("github_pat");
      if (legacy && legacy.trim().length > 0) {
        const res = await fetch("/api/auth/github-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: legacy.trim() }),
          credentials: "include",
        });
        if (res.ok) {
          sessionStorage.removeItem("github_pat");
          set({ hasGithubToken: true });
          return;
        }
      }
    } catch {
      // Ignore sessionStorage access or network errors
    }
    await get().checkTokenStatus();
  },

  checkTokenStatus: async (): Promise<void> => {
    try {
      const res = await fetch("/api/auth/github-token", {
        method: "GET",
        credentials: "include",
      });
      if (res.ok) {
        const data = (await res.json()) as { hasToken?: boolean };
        set({ hasGithubToken: Boolean(data.hasToken) });
      }
    } catch {
      // Keep current status
    }
  },

  clearGithubToken: async (): Promise<void> => {
    try {
      await fetch("/api/auth/github-token", {
        method: "DELETE",
        credentials: "include",
      });
      set({ hasGithubToken: false });
    } catch {
      // Keep current status
    }

    // Cached graphs and file sources may include private repositories that were
    // fetched with this token, so they must not outlive it on a shared machine.
    try {
      await clearAllCachedRepositories();
    } catch {
      // Cache clearing is best effort
    }
  },

  selectNode: (
    nodeId: string | null,
    source: NavigationSource = "canvas",
  ): void => {
    if (!nodeId) {
      set({ selectedNodeId: null, selectedFileId: null, activeTarget: null });
      return;
    }

    if (nodeId.startsWith("file:")) {
      const target: NavigationTarget = {
        fileId: nodeId,
        source,
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
            source,
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

  setHoveredNodeId: (nodeId: string | null): void => {
    set({ hoveredNodeId: nodeId });
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
      activeTrace: null,
      activeStepIndex: null,
      highlightedNodeIds: Object.freeze([]),
      highlightedEdgeIds: Object.freeze([]),
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

    let nextCollapsedFolders = state.collapsedFolderIds;
    let nextSelectedLayers = state.selectedLayers;
    const graph = state.graph;
    const file = graph?.files[target.fileId];
    if (file) {
      const parts = file.path.split("/");
      if (parts.length > 1) {
        const foldersToUncollapse = new Set<string>();
        for (let i = 1; i < parts.length; i++) {
          const prefix = parts.slice(0, i).join("/");
          foldersToUncollapse.add(prefix);
          foldersToUncollapse.add(`folder-group:${prefix}`);
        }
        const needsUncollapse = state.collapsedFolderIds.some((f) =>
          foldersToUncollapse.has(f),
        );
        if (needsUncollapse) {
          nextCollapsedFolders = Object.freeze(
            state.collapsedFolderIds.filter((f) => !foldersToUncollapse.has(f)),
          );
        }
      }

      const layer = classifyLayerForPath(file.path);
      if (
        state.selectedLayers.length > 0 &&
        !state.selectedLayers.includes(layer)
      ) {
        nextSelectedLayers = Object.freeze([...state.selectedLayers, layer]);
      }
    }

    const isProgrammatic = target.source !== "editor";
    const newLock = isProgrammatic ? now + 300 : state.lockedUntil;
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
      collapsedFolderIds: nextCollapsedFolders,
      selectedLayers: nextSelectedLayers,
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

    const lineNum =
      params.line && /^\d+$/.test(params.line.trim())
        ? parseInt(params.line.trim(), 10)
        : null;
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
        selectedFileId: null,
        selectedNodeId: null,
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
          activeTarget: null,
          selectedFileId: null,
          selectedNodeId: null,
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

  toggleLayerFilter: (layerId: ArchitecturalLayerId): void => {
    const current = get().selectedLayers;
    const exists = current.includes(layerId);
    const updated = exists
      ? current.filter((id) => id !== layerId)
      : [...current, layerId];
    set({ selectedLayers: Object.freeze(updated) });
  },

  setLayerFilters: (layerIds: readonly ArchitecturalLayerId[]): void => {
    set({ selectedLayers: Object.freeze([...layerIds]) });
  },

  clearLayerFilters: (): void => {
    set({ selectedLayers: Object.freeze([]) });
  },

  toggleFolderCollapse: (folderId: string): void => {
    const current = get().collapsedFolderIds;
    const exists = current.includes(folderId);
    const updated = exists
      ? current.filter((id) => id !== folderId)
      : [...current, folderId];
    set({ collapsedFolderIds: Object.freeze(updated) });
  },

  collapseAllFolders: (): void => {
    const graph = get().graph;
    const folderKeys = new Set<string>();
    if (graph) {
      for (const dir of Object.values(graph.directories)) {
        if (dir.path) {
          folderKeys.add(dir.path);
          folderKeys.add(`folder-group:${dir.path}`);
        }
      }
      for (const file of Object.values(graph.files)) {
        const parts = file.path.split("/");
        if (parts.length > 1) {
          const folder = parts.slice(0, -1).join("/");
          folderKeys.add(folder);
          folderKeys.add(`folder-group:${folder}`);
        }
      }
    }
    set({ collapsedFolderIds: Object.freeze(Array.from(folderKeys)) });
  },

  expandAllFolders: (): void => {
    set({ collapsedFolderIds: Object.freeze([]) });
  },

  setSearchQuery: (query: string): void => {
    set({ searchQuery: query });
  },

  toggleHideExternal: (): void => {
    set({ hideExternal: !get().hideExternal });
  },

  resetAllFilters: (): void => {
    set({
      selectedLayers: Object.freeze([]),
      collapsedFolderIds: Object.freeze([]),
      searchQuery: "",
      hideExternal: false,
    });
  },

  revealNode: (nodeId: string, source: NavigationSource = "tree"): void => {
    const state = get();
    const graph = state.graph;
    let targetLayer: ArchitecturalLayerId | null = null;
    let filePath: string | null = null;

    if (nodeId.startsWith("file:")) {
      filePath = graph?.files[nodeId]?.path ?? null;
    } else if (nodeId.startsWith("symbol:")) {
      const sym = graph?.symbols[nodeId];
      if (sym) {
        filePath = graph?.files[sym.fileId]?.path ?? null;
      }
    }

    if (filePath) {
      targetLayer = classifyLayerForPath(filePath);
    }

    let nextSelectedLayers = state.selectedLayers;
    if (
      targetLayer &&
      state.selectedLayers.length > 0 &&
      !state.selectedLayers.includes(targetLayer)
    ) {
      nextSelectedLayers = Object.freeze([
        ...state.selectedLayers,
        targetLayer,
      ]);
    }

    let nextCollapsedFolders = state.collapsedFolderIds;
    if (filePath) {
      const parts = filePath.split("/");
      if (parts.length > 1) {
        const foldersToUncollapse = new Set<string>();
        for (let i = 1; i < parts.length; i++) {
          const prefix = parts.slice(0, i).join("/");
          foldersToUncollapse.add(prefix);
          foldersToUncollapse.add(`folder-group:${prefix}`);
        }
        nextCollapsedFolders = Object.freeze(
          state.collapsedFolderIds.filter((f) => !foldersToUncollapse.has(f)),
        );
      }
    }

    set({
      selectedLayers: nextSelectedLayers,
      collapsedFolderIds: nextCollapsedFolders,
      hideExternal: nodeId.startsWith("ext:") ? false : state.hideExternal,
      searchQuery: "",
    });

    get().selectNode(nodeId, source);
  },

  setActiveTrace: (trace: PathTrace | null): void => {
    if (!trace) {
      set({
        activeTrace: null,
        activeStepIndex: null,
        highlightedNodeIds: Object.freeze([]),
        highlightedEdgeIds: Object.freeze([]),
      });
      return;
    }
    set({
      activeTrace: trace,
      activeStepIndex: null,
      highlightedNodeIds: trace.stepNodeIds,
      highlightedEdgeIds: trace.stepEdgeIds,
    });
  },

  focusTraceStep: (stepIndex: number | null): void => {
    const { activeTrace } = get();
    if (
      !activeTrace ||
      stepIndex === null ||
      stepIndex < 0 ||
      stepIndex >= activeTrace.stepNodeIds.length
    ) {
      set({ activeStepIndex: null });
      return;
    }
    const targetNodeId = activeTrace.stepNodeIds[stepIndex];
    set({ activeStepIndex: stepIndex });
    if (targetNodeId) {
      get().revealNode(targetNodeId);
    }
  },

  clearTrace: (): void => {
    set({
      activeTrace: null,
      activeStepIndex: null,
      highlightedNodeIds: Object.freeze([]),
      highlightedEdgeIds: Object.freeze([]),
    });
  },

  setLayoutCalculationState: (
    isCalculating: boolean,
    durationMs?: number | null,
  ): void => {
    set((state) => ({
      isCalculatingLayout: isCalculating,
      layoutDurationMs:
        durationMs !== undefined && durationMs !== null
          ? durationMs
          : isCalculating
            ? state.layoutDurationMs
            : state.layoutDurationMs,
    }));
  },

  reset: (): void => {
    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }
    set({
      ...initialState,
      hasGithubToken: get().hasGithubToken,
    });
  },
}));
