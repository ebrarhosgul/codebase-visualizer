"use client";

import { useState, useEffect, useRef } from "react";
import type { CodebaseGraph } from "@/entities";
import type {
  CodebaseReactFlowNode,
  CodebaseReactFlowEdge,
} from "@/graph/adapters/react-flow-adapter";
import type { GraphFilterState } from "@/stores/graph-store";
import {
  type DagreLayoutOptions,
  DEFAULT_LAYOUT_OPTIONS,
  executeLayoutComputation,
} from "@/graph/layout/layout-computation";
import {
  layoutWorkerClient,
  isWorkerSupported,
  type LayoutClientError,
} from "@/graph/layout/layout-worker-client";
import { useGraphStore } from "@/stores/graph-store";

export const LAYOUT_DEBOUNCE_MS = 50;

export interface UseAsyncGraphLayoutResult {
  readonly nodes: readonly CodebaseReactFlowNode[];
  readonly edges: readonly CodebaseReactFlowEdge[];
  readonly isCalculating: boolean;
  readonly error: LayoutClientError | null;
}

/**
 * Custom React hook that coordinates off-thread Dagre layout and filtering computations.
 *
 * Debounces inputs by 50ms, retains existing nodes and edges during calculation (avoiding canvas blanking),
 * guards against unmount state leaks, and dispatches progress to useGraphStore.
 */
export function useAsyncGraphLayout(
  graph: CodebaseGraph | null | undefined,
  filters: GraphFilterState,
  options: DagreLayoutOptions = DEFAULT_LAYOUT_OPTIONS,
): UseAsyncGraphLayoutResult {
  const setLayoutCalculationState = useGraphStore(
    (state) => state.setLayoutCalculationState,
  );

  // Initialize initial elements synchronously to prevent flash of empty canvas on first render
  const [layoutState, setLayoutState] = useState<UseAsyncGraphLayoutResult>(
    () => {
      const initial = executeLayoutComputation(graph, filters, options);
      return {
        nodes: initial.nodes,
        edges: initial.edges,
        isCalculating: false,
        error: null,
      };
    },
  );

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const activeRequestIdRef = useRef<number>(0);

  // Serialize filter dependencies for stable comparison
  const selectedLayersKey = filters.selectedLayers.join(",");
  const collapsedFoldersKey = filters.collapsedFolderIds.join(",");
  const searchQuery = filters.searchQuery;
  const hideExternal = filters.hideExternal;

  const direction = options.direction ?? "LR";
  const nodeWidth = options.nodeWidth ?? 240;
  const nodeHeight = options.nodeHeight ?? 80;
  const nodeSeparation = options.nodeSeparation ?? 50;
  const rankSeparation = options.rankSeparation ?? 100;
  const groupByFolder = options.groupByFolder ?? true;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const requestId = ++activeRequestIdRef.current;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    // Synchronous execution for test environments without Worker support
    if (!isWorkerSupported()) {
      try {
        const result = executeLayoutComputation(graph, filters, options);
        if (isMountedRef.current && requestId === activeRequestIdRef.current) {
          setLayoutState({
            nodes: result.nodes,
            edges: result.edges,
            isCalculating: false,
            error: null,
          });
          setLayoutCalculationState(false, result.durationMs);
        }
      } catch (err) {
        if (isMountedRef.current && requestId === activeRequestIdRef.current) {
          const clientError =
            err instanceof Error
              ? (err as LayoutClientError)
              : (new Error(String(err)) as LayoutClientError);
          setLayoutState((prev) => ({
            ...prev,
            isCalculating: false,
            error: clientError,
          }));
          setLayoutCalculationState(false, null);
        }
      }
      return;
    }

    // In worker-supported environments, set calculation flag and debounce by 50ms
    setLayoutState((prev) => ({
      ...prev,
      isCalculating: true,
      error: null,
    }));
    setLayoutCalculationState(true);

    debounceTimerRef.current = setTimeout(async () => {
      try {
        const result = await layoutWorkerClient.computeLayout({
          graph: graph!,
          filters,
          options,
        });

        if (isMountedRef.current && requestId === activeRequestIdRef.current) {
          setLayoutState({
            nodes: result.nodes,
            edges: result.edges,
            isCalculating: false,
            error: null,
          });
          setLayoutCalculationState(false, result.durationMs);
        }
      } catch (err) {
        const clientError = err as LayoutClientError;
        // Do not overwrite with error if calculation was superseded by a newer request
        if (clientError.code === "SUPERSEDED") {
          return;
        }

        if (isMountedRef.current && requestId === activeRequestIdRef.current) {
          setLayoutState((prev) => ({
            ...prev,
            isCalculating: false,
            error: clientError,
          }));
          setLayoutCalculationState(false, null);
        }
      }
    }, LAYOUT_DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- serialized keys provide stable dependency tracking without object reference churn
  }, [
    graph,
    selectedLayersKey,
    collapsedFoldersKey,
    searchQuery,
    hideExternal,
    direction,
    nodeWidth,
    nodeHeight,
    nodeSeparation,
    rankSeparation,
    groupByFolder,
    setLayoutCalculationState,
  ]);

  return layoutState;
}
