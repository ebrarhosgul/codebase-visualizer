"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Search,
  X,
  FoldHorizontal,
  UnfoldHorizontal,
  RotateCcw,
  EyeOff,
  Eye,
} from "lucide-react";
import { useGraphStore } from "@/stores/graph-store";
import {
  ARCHITECTURAL_LAYERS,
  classifyLayerForPath,
  type ArchitecturalLayerId,
} from "@/graph/layers";
import { matchesSearchTokens } from "@/graph/filtering";
import type { FileNode } from "@/entities";
import { cn } from "@/lib/utils";

export interface LayerFilterBarProps {
  readonly onFocusPrimaryMatch?: (nodeId: string) => void;
  readonly className?: string;
}

/**
 * Floating horizontal filter bar above architecture canvas.
 * Provides layer toggle chips, 200ms debounced search with primary match camera focus,
 * bulk directory collapse/expand triggers, external module toggling, and quick reset.
 */
export function LayerFilterBar({
  onFocusPrimaryMatch,
  className,
}: LayerFilterBarProps): React.JSX.Element | null {
  const graph = useGraphStore((state) => state.graph);
  const selectedLayers = useGraphStore((state) => state.selectedLayers);
  const collapsedFolderIds = useGraphStore((state) => state.collapsedFolderIds);
  const searchQuery = useGraphStore((state) => state.searchQuery);
  const hideExternal = useGraphStore((state) => state.hideExternal);

  const toggleLayerFilter = useGraphStore((state) => state.toggleLayerFilter);
  const clearLayerFilters = useGraphStore((state) => state.clearLayerFilters);
  const collapseAllFolders = useGraphStore((state) => state.collapseAllFolders);
  const expandAllFolders = useGraphStore((state) => state.expandAllFolders);
  const setSearchQuery = useGraphStore((state) => state.setSearchQuery);
  const toggleHideExternal = useGraphStore((state) => state.toggleHideExternal);
  const resetAllFilters = useGraphStore((state) => state.resetAllFilters);
  const navigateToTarget = useGraphStore((state) => state.navigateToTarget);

  const [localSearch, setLocalSearch] = useState(searchQuery);

  // Sync external resets
  useEffect(() => {
    setLocalSearch(searchQuery);
  }, [searchQuery]);

  // Compute discovered layers and file count per layer in the active graph
  const { discoveredLayers, layerCounts } = useMemo(() => {
    if (!graph || Object.keys(graph.files).length === 0) {
      return {
        discoveredLayers: [],
        layerCounts: new Map<ArchitecturalLayerId, number>(),
      };
    }

    const counts = new Map<ArchitecturalLayerId, number>();
    for (const file of Object.values(graph.files)) {
      const layerId = classifyLayerForPath(file.path);
      counts.set(layerId, (counts.get(layerId) ?? 0) + 1);
    }

    const layers = ARCHITECTURAL_LAYERS.filter(
      (layer) => (counts.get(layer.id) ?? 0) > 0,
    );

    return { discoveredLayers: layers, layerCounts: counts };
  }, [graph]);

  // Focus primary match determined by exact name match first, followed by highest caller count (AC-6)
  const focusPrimaryMatch = useCallback(
    (query: string): void => {
      if (!graph) return;
      const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
      if (tokens.length === 0) return;

      const candidates: Array<{
        id: string;
        file: FileNode;
        exactMatch: boolean;
        fanIn: number;
      }> = [];

      for (const file of Object.values(graph.files)) {
        if (matchesSearchTokens(file, tokens, graph)) {
          const exact =
            file.name.toLowerCase() === query.toLowerCase() ||
            file.symbolIds.some(
              (symId) =>
                graph.symbols[symId]?.name.toLowerCase() ===
                query.toLowerCase(),
            );

          let fanIn = 0;
          for (const edge of Object.values(graph.edges)) {
            if (edge.targetId === file.id) {
              fanIn += edge.weight;
            }
          }

          candidates.push({ id: file.id, file, exactMatch: exact, fanIn });
        }
      }

      if (candidates.length === 0) return;

      candidates.sort((a, b) => {
        if (a.exactMatch && !b.exactMatch) return -1;
        if (!a.exactMatch && b.exactMatch) return 1;
        return b.fanIn - a.fanIn;
      });

      const primary = candidates[0];
      if (primary) {
        if (onFocusPrimaryMatch) {
          onFocusPrimaryMatch(primary.id);
        }
        navigateToTarget({
          fileId: primary.id,
          source: "search",
          timestamp: Date.now(),
        });
      }
    },
    [graph, onFocusPrimaryMatch, navigateToTarget],
  );

  // Debounce search keystrokes by 200ms before updating canvas nodes (AC-6)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch !== searchQuery) {
        setSearchQuery(localSearch);
        if (localSearch.trim().length > 0) {
          focusPrimaryMatch(localSearch.trim());
        }
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [localSearch, searchQuery, setSearchQuery, focusPrimaryMatch]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Enter") {
      e.preventDefault();
      setSearchQuery(localSearch);
      focusPrimaryMatch(localSearch.trim());
    }
  };

  const handleClearSearch = (): void => {
    setLocalSearch("");
    setSearchQuery("");
  };

  if (!graph || Object.keys(graph.files).length === 0) {
    return null;
  }

  const isAnyFilterActive =
    selectedLayers.length > 0 ||
    collapsedFolderIds.length > 0 ||
    searchQuery.trim().length > 0 ||
    hideExternal;

  return (
    <nav
      aria-label="Architectural filter and canvas controls"
      className={cn(
        "flex items-center gap-2 max-w-full overflow-x-auto p-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-panel)]/90 backdrop-blur-md shadow-lg select-none",
        className,
      )}
      data-testid="layer-filter-bar"
    >
      {/* Real-time Debounced Search Input (AC-6) */}
      <div className="relative flex items-center shrink-0 min-w-[170px] sm:min-w-[210px]">
        <Search className="absolute left-2.5 w-3.5 h-3.5 text-[var(--text-muted)] pointer-events-none" />
        <input
          type="text"
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Filter files or symbols..."
          className="w-full h-7 pl-8 pr-7 text-xs font-mono bg-[var(--surface-canvas)] text-[var(--text-primary)] border border-[var(--border-default)] rounded-lg placeholder:text-[var(--text-muted)] focus:outline-hidden focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)]/30 transition-all"
          data-testid="canvas-search-input"
          aria-label="Filter canvas by file or symbol name"
        />
        {localSearch.length > 0 && (
          <button
            type="button"
            onClick={handleClearSearch}
            className="absolute right-2 p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            aria-label="Clear search"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      <div className="h-4 w-px bg-[var(--border-subtle)] shrink-0" />

      {/* Discovered Architectural Layer Filter Chips (AC-2) */}
      <div
        className="flex items-center gap-1.5 shrink-0"
        role="group"
        aria-label="Architectural layers"
      >
        {discoveredLayers.map((layer) => {
          const isSelected = selectedLayers.includes(layer.id);
          const isFiltering = selectedLayers.length > 0;
          const count = layerCounts.get(layer.id) ?? 0;

          return (
            <button
              key={layer.id}
              type="button"
              onClick={() => toggleLayerFilter(layer.id)}
              aria-pressed={isSelected}
              className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-mono font-medium transition-all shrink-0 cursor-pointer border",
                isSelected
                  ? "border-current shadow-xs"
                  : isFiltering
                    ? "border-transparent opacity-40 hover:opacity-80 bg-[var(--surface-canvas)]"
                    : "border-[var(--border-subtle)] bg-[var(--surface-canvas)] hover:border-[var(--border-focus)] text-[var(--text-secondary)]",
              )}
              style={
                isSelected
                  ? {
                      color: layer.color,
                      backgroundColor: `${layer.color}15`,
                      borderColor: `${layer.color}60`,
                    }
                  : undefined
              }
              data-testid={`layer-filter-${layer.id}`}
              aria-label={`Filter by ${layer.label} layer (${count} files)`}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: layer.color }}
              />
              <span className="truncate">{layer.label}</span>
              <span className="text-[10px] opacity-70">({count})</span>
            </button>
          );
        })}

        {selectedLayers.length > 0 && (
          <button
            type="button"
            onClick={clearLayerFilters}
            className="text-[11px] font-mono text-[var(--text-muted)] hover:text-[var(--text-primary)] underline px-1.5 py-0.5 transition-colors shrink-0"
            data-testid="clear-layer-filters"
          >
            All layers
          </button>
        )}
      </div>

      <div className="h-4 w-px bg-[var(--border-subtle)] shrink-0" />

      {/* Bulk Directory Operations (AC-2) */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={collapseAllFolders}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-mono text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] border border-transparent hover:border-[var(--border-subtle)] transition-colors shrink-0"
          title="Collapse all folders into summary cards"
          data-testid="collapse-all-folders"
          aria-label="Collapse all folders"
        >
          <FoldHorizontal className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Collapse</span>
        </button>

        <button
          type="button"
          onClick={expandAllFolders}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-mono text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] border border-transparent hover:border-[var(--border-subtle)] transition-colors shrink-0"
          title="Expand all folders"
          data-testid="expand-all-folders"
          aria-label="Expand all folders"
        >
          <UnfoldHorizontal className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Expand</span>
        </button>

        {/* Toggle External Modules */}
        <button
          type="button"
          onClick={toggleHideExternal}
          aria-pressed={hideExternal}
          className={cn(
            "flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-mono border transition-colors shrink-0",
            hideExternal
              ? "bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] border-[var(--accent-primary)]/30"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] border-transparent hover:border-[var(--border-subtle)]",
          )}
          title={
            hideExternal ? "Show external modules" : "Hide external modules"
          }
          data-testid="toggle-hide-external"
        >
          {hideExternal ? (
            <EyeOff className="w-3.5 h-3.5" />
          ) : (
            <Eye className="w-3.5 h-3.5" />
          )}
          <span className="hidden md:inline">
            {hideExternal ? "External hidden" : "External"}
          </span>
        </button>

        {/* Reset All Filters Button (AC-2, AC-10) */}
        {isAnyFilterActive && (
          <button
            type="button"
            onClick={resetAllFilters}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-mono text-amber-500 hover:text-amber-400 hover:bg-amber-500/10 border border-amber-500/20 transition-colors shrink-0"
            title="Reset all filters and search query"
            data-testid="reset-all-filters"
          >
            <RotateCcw className="w-3 h-3" />
            <span className="hidden sm:inline">Reset</span>
          </button>
        )}
      </div>
    </nav>
  );
}
