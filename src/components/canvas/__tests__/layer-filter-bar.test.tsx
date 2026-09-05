import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { LayerFilterBar } from "../layer-filter-bar";
import { useGraphStore } from "@/stores/graph-store";
import type { CodebaseGraph, FileNode } from "@/entities";

describe("LayerFilterBar Component", () => {
  const mockGraph: CodebaseGraph = {
    schemaVersion: 1,
    repository: {
      id: "repo:test/repo",
      owner: "test",
      name: "repo",
      fullName: "test/repo",
      defaultBranch: "main",
      commitSha: "abc",
      analyzedAt: "2026-09-05T00:00:00Z",
      totalFiles: 3,
      totalSymbols: 0,
      languages: { typescript: 100 },
      schemaVersion: 1,
    },
    directories: {},
    files: {
      "file:btn": {
        id: "file:btn",
        path: "src/components/btn.tsx",
        name: "btn.tsx",
        symbolIds: [],
      } as unknown as FileNode,
      "file:card": {
        id: "file:card",
        path: "src/components/card.tsx",
        name: "card.tsx",
        symbolIds: [],
      } as unknown as FileNode,
      "file:store": {
        id: "file:store",
        path: "src/stores/use-store.ts",
        name: "use-store.ts",
        symbolIds: [],
      } as unknown as FileNode,
    },
    symbols: {},
    externalModules: {},
    edges: {},
  };

  beforeEach(() => {
    vi.useFakeTimers();
    useGraphStore.getState().reset();
    useGraphStore.getState().setGraph(mockGraph);
  });

  it("renders discovered layer filter badges with file count chips (AC-2)", () => {
    render(<LayerFilterBar />);

    // Components has 2 files, Stores has 1 file
    const compBtn = screen.getByTestId("layer-filter-components");
    const storeBtn = screen.getByTestId("layer-filter-stores");

    expect(compBtn).toBeInTheDocument();
    expect(compBtn).toHaveTextContent("Components");
    expect(compBtn).toHaveTextContent("(2)");

    expect(storeBtn).toBeInTheDocument();
    expect(storeBtn).toHaveTextContent("Stores");
    expect(storeBtn).toHaveTextContent("(1)");
  });

  it("toggles layer filter when chip is clicked (AC-2)", () => {
    render(<LayerFilterBar />);

    const compBtn = screen.getByTestId("layer-filter-components");
    fireEvent.click(compBtn);

    expect(useGraphStore.getState().selectedLayers).toEqual(["components"]);

    // "All layers" clear button should appear
    const clearBtn = screen.getByTestId("clear-layer-filters");
    expect(clearBtn).toBeInTheDocument();

    fireEvent.click(clearBtn);
    expect(useGraphStore.getState().selectedLayers).toEqual([]);
  });

  it("debounces search input by 200ms before updating store (AC-6)", () => {
    render(<LayerFilterBar />);

    const searchInput = screen.getByTestId("canvas-search-input");
    fireEvent.change(searchInput, { target: { value: "card" } });

    // Before timer elapses, store should not have updated
    expect(useGraphStore.getState().searchQuery).toBe("");

    // Fast-forward past debounce interval
    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(useGraphStore.getState().searchQuery).toBe("card");
  });

  it("triggers bulk folder collapse and expand actions (AC-2, AC-4)", () => {
    render(<LayerFilterBar />);

    const collapseBtn = screen.getByTestId("collapse-all-folders");
    const expandBtn = screen.getByTestId("expand-all-folders");

    fireEvent.click(collapseBtn);
    expect(useGraphStore.getState().collapsedFolderIds.length).toBeGreaterThan(
      0,
    );

    fireEvent.click(expandBtn);
    expect(useGraphStore.getState().collapsedFolderIds).toEqual([]);
  });

  it("displays reset button and clears active filters (AC-2, AC-10)", () => {
    render(<LayerFilterBar />);

    const compBtn = screen.getByTestId("layer-filter-components");
    fireEvent.click(compBtn);

    const resetBtn = screen.getByTestId("reset-all-filters");
    expect(resetBtn).toBeInTheDocument();

    fireEvent.click(resetBtn);
    expect(useGraphStore.getState().selectedLayers).toEqual([]);
  });
});
