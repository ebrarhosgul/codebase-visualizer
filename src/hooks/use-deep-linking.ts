"use client";

import { useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useGraphStore } from "@/stores/graph-store";
import { useWorkspaceStore } from "@/stores/workspace-store";

export interface DeepLinkingSyncProps {
  readonly onFallback?: (message: string) => void;
}

/**
 * Validates alphanumeric, slash, dot, and hyphen characters for safe query params.
 */
function isValidQueryValue(val: string): boolean {
  return /^[a-zA-Z0-9_\-./#]+$/.test(val);
}

/**
 * Custom hook synchronizing browser URL query parameters bidirectionally
 * with architecture canvas node selection and Monaco editor line coordinates.
 */
export function useDeepLinking(onFallback?: (message: string) => void): void {
  let router: ReturnType<typeof useRouter> | null = null;
  let nextSearchParams: ReturnType<typeof useSearchParams> | null = null;

  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    router = useRouter();
  } catch {
    // Graceful fallback when rendered outside Next.js App Router context
  }

  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    nextSearchParams = useSearchParams();
  } catch {
    // Graceful fallback when rendered outside Next.js App Router context
  }

  const repository = useGraphStore((state) => state.repository);
  const graph = useGraphStore((state) => state.graph);
  const activeTarget = useGraphStore((state) => state.activeTarget);
  const selectedFileId = useGraphStore((state) => state.selectedFileId);
  const isIngesting = useGraphStore((state) => state.isIngesting);
  const startIngestion = useGraphStore((state) => state.startIngestion);
  const bufferDeepLink = useGraphStore((state) => state.bufferDeepLink);
  const fallbackNotification = useGraphStore(
    (state) => state.fallbackNotification,
  );
  const clearFallbackNotification = useGraphStore(
    (state) => state.clearFallbackNotification,
  );

  const initialHydratedRef = useRef(false);
  const lastSynchronizedUrlRef = useRef<string>("");

  // 1. Initial cold-start URL hydration (AC-1, AC-7)
  useEffect(() => {
    if (initialHydratedRef.current) {
      return;
    }
    initialHydratedRef.current = true;

    const currentSearchParams =
      nextSearchParams ??
      new URLSearchParams(
        typeof window !== "undefined" ? window.location.search : "",
      );

    const repoParam = currentSearchParams.get("repo")?.trim();
    const branchParam = currentSearchParams.get("branch")?.trim();
    const fileParam = currentSearchParams.get("file")?.trim();
    const lineParam = currentSearchParams.get("line")?.trim();
    const symbolParam = currentSearchParams.get("symbol")?.trim();

    // Validate parameters against invalid characters
    const isFileValid = !fileParam || isValidQueryValue(fileParam);
    const isSymbolValid = !symbolParam || isValidQueryValue(symbolParam);

    if (!isFileValid || !isSymbolValid) {
      onFallback?.("Invalid deep link parameters were discarded.");
      if (typeof window !== "undefined") {
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete("file");
        cleanUrl.searchParams.delete("line");
        cleanUrl.searchParams.delete("symbol");
        const nextQuery = cleanUrl.searchParams.toString();
        const nextUrl = nextQuery ? `?${nextQuery}` : cleanUrl.pathname;
        window.history.replaceState(null, "", nextUrl);
      }
      return;
    }

    if (fileParam || symbolParam) {
      bufferDeepLink({
        repo: repoParam,
        branch: branchParam,
        file: fileParam,
        line: lineParam,
        symbol: symbolParam,
      });
    }

    // Auto-ingest repository from URL if present and not already ingesting or loaded
    if (repoParam && !repository && !isIngesting) {
      const repoUrl = repoParam.startsWith("http")
        ? repoParam
        : `https://github.com/${repoParam}`;

      void startIngestion({
        repositoryUrl: repoUrl,
        branch: branchParam || undefined,
      });
    }
  }, [
    nextSearchParams,
    repository,
    isIngesting,
    startIngestion,
    bufferDeepLink,
    onFallback,
  ]);

  // 2. Handle fallback notifications when bookmarked file or symbol is not found (AC-6)
  useEffect(() => {
    if (!fallbackNotification) {
      return;
    }
    onFallback?.(fallbackNotification);
    if (typeof window !== "undefined") {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete("file");
      cleanUrl.searchParams.delete("line");
      cleanUrl.searchParams.delete("symbol");
      const nextQuery = cleanUrl.searchParams.toString();
      const nextUrl = nextQuery ? `?${nextQuery}` : cleanUrl.pathname;
      window.history.replaceState(null, "", nextUrl);
    }
    clearFallbackNotification();
  }, [fallbackNotification, onFallback, clearFallbackNotification]);

  // 3. Switch workspace right panel to code when URL deep link navigates to a target (AC-1, AC-7)
  useEffect(() => {
    if (activeTarget?.source === "url") {
      useWorkspaceStore.getState().setActiveRightTab("code");
      useWorkspaceStore.getState().setRightPanelCollapsed(false);
    }
  }, [activeTarget]);

  // 4. Handle browser back and forward popstate navigation
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handlePopState = () => {
      const currentSearchParams = new URLSearchParams(window.location.search);
      const fileParam = currentSearchParams.get("file")?.trim();
      const lineParam = currentSearchParams.get("line")?.trim();
      const symbolParam = currentSearchParams.get("symbol")?.trim();

      if (fileParam) {
        const fileId = fileParam.startsWith("file:")
          ? fileParam
          : `file:${fileParam}`;
        const lineNum = lineParam ? parseInt(lineParam, 10) : null;
        const validLine =
          lineNum && Number.isFinite(lineNum) && lineNum > 0 ? lineNum : null;
        const currentGraph = useGraphStore.getState().graph;
        let symbolId: string | null = null;

        if (symbolParam && currentGraph) {
          const matched = Object.values(currentGraph.symbols).find(
            (s) => s.fileId === fileId && s.name === symbolParam,
          );
          symbolId = matched ? matched.id : null;
        }

        useGraphStore.getState().navigateToTarget({
          fileId,
          symbolId,
          line: validLine,
          source: "url",
          timestamp: Date.now(),
        });
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // 5. Synchronize active state to URL query parameters
  useEffect(() => {
    if (typeof window === "undefined" || !repository) {
      return;
    }

    const targetFile = activeTarget?.fileId || selectedFileId;

    // Build desired query params
    const nextParams = new URLSearchParams();
    if (repository.fullName) {
      nextParams.set("repo", repository.fullName);
    }
    if (repository.defaultBranch) {
      nextParams.set("branch", repository.defaultBranch);
    }

    if (targetFile) {
      const cleanPath = targetFile.replace(/^file:/, "");
      nextParams.set("file", cleanPath);
    }

    if (activeTarget?.line) {
      nextParams.set("line", String(activeTarget.line));
    }

    if (activeTarget?.symbolId && graph?.symbols[activeTarget.symbolId]) {
      nextParams.set("symbol", graph.symbols[activeTarget.symbolId].name);
    }

    const queryString = nextParams.toString();
    const nextUrl = queryString ? `?${queryString}` : window.location.pathname;

    if (nextUrl === lastSynchronizedUrlRef.current) {
      return;
    }
    lastSynchronizedUrlRef.current = nextUrl;

    // Use replaceState for high-frequency editor cursor updates to prevent Next.js re-render thrashing (AC-1)
    if (activeTarget?.source === "editor" || !router) {
      window.history.replaceState(null, "", nextUrl);
    } else {
      // Use router.replace for discrete node or navigation clicks
      router.replace(nextUrl, { scroll: false });
    }
  }, [repository, graph, activeTarget, selectedFileId, router]);
}

/**
 * Client component wrapping useDeepLinking for inclusion in React Suspense boundaries.
 */
export function DeepLinkingSync({ onFallback }: DeepLinkingSyncProps): null {
  useDeepLinking(onFallback);
  return null;
}
