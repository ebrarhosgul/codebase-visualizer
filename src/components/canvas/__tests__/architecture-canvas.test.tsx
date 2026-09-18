import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ArchitectureCanvas } from "../architecture-canvas";
import { useGraphStore } from "@/stores/graph-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { CodebaseGraph } from "@/entities";
import { layoutWorkerClient } from "@/graph/layout/layout-worker-client";
import {
  createWorkerErrorResponse,
  type LayoutWorkerRequest,
  type LayoutWorkerResponse,
} from "@/lib/workers/worker-types";

import type { ReactFlowProps, Edge } from "@xyflow/react";

const mockSetCenter = vi.fn();
const mockFitView = vi.fn();
const mockZoomIn = vi.fn();
const mockZoomOut = vi.fn();

let capturedReactFlowProps: ReactFlowProps | null = null;
let capturedViewportChangeHandler:
  ((viewport: { x: number; y: number; zoom: number }) => void) | null = null;

vi.mock("@xyflow/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@xyflow/react")>();
  return {
    ...actual,
    useOnViewportChange: (options: {
      onChange?: (viewport: { x: number; y: number; zoom: number }) => void;
    }) => {
      if (options.onChange) {
        capturedViewportChangeHandler = options.onChange;
      }
    },
    ReactFlow: (props: ReactFlowProps) => {
      capturedReactFlowProps = props;
      return <actual.ReactFlow {...props} />;
    },
    useReactFlow: () => ({
      fitView: mockFitView,
      zoomIn: mockZoomIn,
      zoomOut: mockZoomOut,
      getZoom: () => 1.0,
      setCenter: mockSetCenter,
    }),
  };
});

describe("ArchitectureCanvas", () => {
  const originalWorker = globalThis.Worker;

  beforeEach(() => {
    layoutWorkerClient.terminate();
    useGraphStore.getState().reset();
    useWorkspaceStore.getState().resetLayout();
    capturedReactFlowProps = null;
    capturedViewportChangeHandler = null;
    mockSetCenter.mockClear();
    mockFitView.mockClear();
    mockZoomIn.mockClear();
    mockZoomOut.mockClear();
  });

  afterEach(() => {
    layoutWorkerClient.terminate();
    if (originalWorker) {
      globalThis.Worker = originalWorker;
    } else {
      delete (globalThis as Record<string, unknown>).Worker;
    }
  });

  it("renders empty canvas welcome state when no graph is loaded", () => {
    render(<ArchitectureCanvas />);
    expect(screen.getByTestId("canvas-empty-state")).toBeInTheDocument();
    expect(screen.getByText("Architecture Graph Canvas")).toBeInTheDocument();
  });

  it("renders interactive React Flow canvas when graph is loaded in store", () => {
    const mockGraph = {
      schemaVersion: 1,
      repository: {
        id: "repo:org/app",
        owner: "org",
        name: "app",
        fullName: "org/app",
        defaultBranch: "main",
        commitSha: "sha1",
        analyzedAt: new Date().toISOString(),
        totalFiles: 1,
        totalSymbols: 0,
        languages: { typescript: 1 },
        schemaVersion: 1,
      },
      directories: {},
      files: {
        "file:src/main.ts": {
          id: "file:src/main.ts",
          path: "src/main.ts",
          name: "main.ts",
          extension: ".ts",
          language: "typescript",
          sizeBytes: 200,
          lineCount: 15,
          directoryId: "dir:src",
          symbolIds: [],
          importIds: [],
          exportIds: [],
        },
      },
      symbols: {},
      externalModules: {},
      edges: {},
    } as unknown as CodebaseGraph;

    useGraphStore.getState().setGraph(mockGraph);

    render(<ArchitectureCanvas />);
    expect(screen.getByTestId("architecture-canvas")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zoom in" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Fit entire graph in view" }),
    ).toBeInTheDocument();
  });

  it("centers canvas camera when activeTarget source is editor, but not for canvas clicks (AC-3)", () => {
    const mockGraph = {
      schemaVersion: 1,
      repository: {
        id: "repo:org/app",
        owner: "org",
        name: "app",
        fullName: "org/app",
        defaultBranch: "main",
        commitSha: "sha1",
        analyzedAt: new Date().toISOString(),
        totalFiles: 1,
        totalSymbols: 0,
        languages: { typescript: 1 },
        schemaVersion: 1,
      },
      directories: {},
      files: {
        "file:src/main.ts": {
          id: "file:src/main.ts",
          path: "src/main.ts",
          name: "main.ts",
          extension: ".ts",
          language: "typescript",
          sizeBytes: 200,
          lineCount: 15,
          directoryId: "dir:src",
          symbolIds: [],
          importIds: [],
          exportIds: [],
        },
      },
      symbols: {},
      externalModules: {},
      edges: {},
    } as unknown as CodebaseGraph;

    useGraphStore.getState().setGraph(mockGraph);
    render(<ArchitectureCanvas />);

    // 1. Canvas source navigation should NOT trigger setCenter
    act(() => {
      useGraphStore.getState().navigateToTarget({
        fileId: "file:src/main.ts",
        source: "canvas",
        timestamp: Date.now(),
      });
    });
    expect(mockSetCenter).not.toHaveBeenCalled();

    // Advance past 300ms time lock (AC-4)
    act(() => {
      useGraphStore.setState({ lockedUntil: 0 });
    });

    // 2. Editor source navigation SHOULD trigger setCenter
    act(() => {
      useGraphStore.getState().navigateToTarget({
        fileId: "file:src/main.ts",
        line: 10,
        source: "editor",
        timestamp: Date.now() + 500,
      });
    });
    expect(mockSetCenter).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(Number),
      expect.objectContaining({ zoom: 1.2, duration: 800 }),
    );
  });

  it("avoids camera jitter when editor cursor moves repeatedly within the same target node (AC-3)", () => {
    const mockGraph = {
      schemaVersion: 1,
      repository: {
        id: "repo:org/app",
        owner: "org",
        name: "app",
        fullName: "org/app",
        defaultBranch: "main",
        commitSha: "sha1",
        analyzedAt: new Date().toISOString(),
        totalFiles: 1,
        totalSymbols: 0,
        languages: { typescript: 1 },
        schemaVersion: 1,
      },
      directories: {},
      files: {
        "file:src/main.ts": {
          id: "file:src/main.ts",
          path: "src/main.ts",
          name: "main.ts",
          extension: ".ts",
          language: "typescript",
          sizeBytes: 200,
          lineCount: 15,
          directoryId: "dir:src",
          symbolIds: [],
          importIds: [],
          exportIds: [],
        },
      },
      symbols: {},
      externalModules: {},
      edges: {},
    } as unknown as CodebaseGraph;

    useGraphStore.getState().setGraph(mockGraph);
    render(<ArchitectureCanvas />);

    // First cursor event centers camera
    act(() => {
      useGraphStore.getState().navigateToTarget({
        fileId: "file:src/main.ts",
        line: 5,
        source: "editor",
        timestamp: Date.now(),
      });
    });
    expect(mockSetCenter).toHaveBeenCalledTimes(1);

    // Second cursor event within the same file should NOT re-trigger setCenter
    act(() => {
      useGraphStore.getState().navigateToTarget({
        fileId: "file:src/main.ts",
        line: 6,
        source: "editor",
        timestamp: Date.now() + 100,
      });
    });
    expect(mockSetCenter).toHaveBeenCalledTimes(1);
  });

  it("centers camera when activeTarget is present upon cold start graph hydration (AC-7)", () => {
    const mockGraph = {
      schemaVersion: 1,
      repository: {
        id: "repo:org/app",
        owner: "org",
        name: "app",
        fullName: "org/app",
        defaultBranch: "main",
        commitSha: "sha1",
        analyzedAt: new Date().toISOString(),
        totalFiles: 1,
        totalSymbols: 0,
        languages: { typescript: 1 },
        schemaVersion: 1,
      },
      directories: {},
      files: {
        "file:src/target.ts": {
          id: "file:src/target.ts",
          path: "src/target.ts",
          name: "target.ts",
          extension: ".ts",
          language: "typescript",
          sizeBytes: 200,
          lineCount: 15,
          directoryId: "dir:src",
          symbolIds: [],
          importIds: [],
          exportIds: [],
        },
      },
      symbols: {},
      externalModules: {},
      edges: {},
    } as unknown as CodebaseGraph;

    // Buffer deep link target before graph loads
    useGraphStore.getState().bufferDeepLink({
      repo: "org/app",
      file: "src/target.ts",
      line: "8",
    });

    // Set graph triggers flushPendingDeepLink which sets activeTarget with source: "url"
    useGraphStore.getState().setGraph(mockGraph);

    render(<ArchitectureCanvas />);

    // Camera centering should execute successfully on initial render with initialNodes
    expect(mockSetCenter).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(Number),
      expect.objectContaining({ zoom: 1.2, duration: 800 }),
    );
  });

  it("triggers zoom and fit view actions via toolbar buttons (AC-3)", () => {
    const mockGraph = {
      schemaVersion: 1,
      repository: {
        id: "repo:org/app",
        owner: "org",
        name: "app",
        fullName: "org/app",
        defaultBranch: "main",
        commitSha: "sha1",
        analyzedAt: new Date().toISOString(),
        totalFiles: 1,
        totalSymbols: 0,
        languages: { typescript: 1 },
        schemaVersion: 1,
      },
      directories: {},
      files: {
        "file:src/main.ts": {
          id: "file:src/main.ts",
          path: "src/main.ts",
          name: "main.ts",
          extension: ".ts",
          language: "typescript",
          sizeBytes: 200,
          lineCount: 15,
          directoryId: "dir:src",
          symbolIds: [],
          importIds: [],
          exportIds: [],
        },
      },
      symbols: {},
      externalModules: {},
      edges: {},
    } as unknown as CodebaseGraph;

    useGraphStore.getState().setGraph(mockGraph);
    render(<ArchitectureCanvas />);

    const zoomInBtn = screen.getByRole("button", { name: "Zoom in" });
    const zoomOutBtn = screen.getByRole("button", { name: "Zoom out" });
    const fitViewBtn = screen.getByRole("button", {
      name: "Fit entire graph in view",
    });

    act(() => {
      zoomInBtn.click();
    });
    expect(mockZoomIn).toHaveBeenCalledWith({ duration: 200 });

    act(() => {
      zoomOutBtn.click();
    });
    expect(mockZoomOut).toHaveBeenCalledWith({ duration: 200 });

    act(() => {
      fitViewBtn.click();
    });
    expect(mockFitView).toHaveBeenCalledWith({
      duration: 300,
      padding: 0.2,
    });
  });

  it("renders ingestion in-progress state when repository is being analyzed", () => {
    useGraphStore.setState({ isIngesting: true });
    render(<ArchitectureCanvas />);

    expect(
      screen.getByText("Analyzing Codebase Architecture..."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Streaming repository archive and parsing/i),
    ).toBeInTheDocument();
  });

  it("safely ignores camera centering when active target does not exist in graph (AC-6)", () => {
    const mockGraph = {
      schemaVersion: 1,
      repository: {
        id: "repo:org/app",
        owner: "org",
        name: "app",
        fullName: "org/app",
        defaultBranch: "main",
        commitSha: "sha1",
        analyzedAt: new Date().toISOString(),
        totalFiles: 1,
        totalSymbols: 0,
        languages: { typescript: 1 },
        schemaVersion: 1,
      },
      directories: {},
      files: {
        "file:src/main.ts": {
          id: "file:src/main.ts",
          path: "src/main.ts",
          name: "main.ts",
          extension: ".ts",
          language: "typescript",
          sizeBytes: 200,
          lineCount: 15,
          directoryId: "dir:src",
          symbolIds: [],
          importIds: [],
          exportIds: [],
        },
      },
      symbols: {},
      externalModules: {},
      edges: {},
    } as unknown as CodebaseGraph;

    useGraphStore.getState().setGraph(mockGraph);
    render(<ArchitectureCanvas />);

    act(() => {
      useGraphStore.getState().navigateToTarget({
        fileId: "file:src/missing.ts",
        line: 10,
        source: "editor",
        timestamp: Date.now() + 500,
      });
    });

    expect(mockSetCenter).not.toHaveBeenCalled();
  });

  it("allows toggling cursor-follow mode to pause auto-centering while tracking flow", async () => {
    const mockGraph = {
      schemaVersion: 1,
      repository: {
        id: "repo:org/app",
        owner: "org",
        name: "app",
        fullName: "org/app",
        defaultBranch: "main",
        commitSha: "sha1",
      },
      files: {
        "file:src/main.ts": {
          id: "file:src/main.ts",
          path: "src/main.ts",
          name: "main.ts",
          extension: ".ts",
          language: "typescript",
          sizeBytes: 200,
          lineCount: 15,
          directoryId: "dir:src",
          symbolIds: [],
          importIds: [],
          exportIds: [],
        },
      },
      symbols: {},
      directories: {},
      externalModules: {},
      edges: {},
    } as unknown as CodebaseGraph;

    useGraphStore.getState().setGraph(mockGraph);
    const { fireEvent } = await import("@testing-library/react");
    render(<ArchitectureCanvas />);

    // Locate the follow cursor button
    const followBtn = screen.getByRole("button", {
      name: /Follow code cursor/i,
    });
    expect(followBtn).toBeInTheDocument();

    // Click to pause follow mode
    act(() => {
      fireEvent.click(followBtn);
    });

    mockSetCenter.mockClear();

    // Trigger editor navigation while follow mode is paused
    act(() => {
      useGraphStore.getState().navigateToTarget({
        fileId: "file:src/main.ts",
        line: 10,
        source: "editor",
        timestamp: Date.now() + 500,
      });
    });

    // Camera should NOT move, preserving the user's flow tracking position
    expect(mockSetCenter).not.toHaveBeenCalled();
  });

  it("renders filtered empty state with reset button when filters exclude all nodes (AC-10)", () => {
    const mockGraph = {
      schemaVersion: 1,
      repository: {
        id: "repo:test/empty",
        owner: "test",
        name: "empty",
        fullName: "test/empty",
        defaultBranch: "main",
        commitSha: "sha1",
        analyzedAt: new Date().toISOString(),
        totalFiles: 1,
        totalSymbols: 0,
        languages: { typescript: 1 },
        schemaVersion: 1,
      },
      directories: {},
      files: {
        "file:src/main.ts": {
          id: "file:src/main.ts",
          path: "src/main.ts",
          name: "main.ts",
          extension: ".ts",
          language: "typescript",
          sizeBytes: 100,
          lineCount: 10,
          directoryId: "dir:src",
          symbolIds: [],
          importIds: [],
          exportIds: [],
        },
      },
      symbols: {},
      externalModules: {},
      edges: {},
    } as unknown as CodebaseGraph;

    useGraphStore.getState().setGraph(mockGraph);

    // Apply a search filter that matches nothing
    act(() => {
      useGraphStore.getState().setSearchQuery("non_existent_symbol");
    });

    render(<ArchitectureCanvas />);

    expect(
      screen.getByTestId("canvas-filtered-empty-state"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No matching architectural nodes"),
    ).toBeInTheDocument();

    const resetBtn = screen.getByTestId("empty-reset-filters-btn");
    expect(resetBtn).toBeInTheDocument();

    // Clicking reset button clears filters
    act(() => {
      resetBtn.click();
    });

    expect(useGraphStore.getState().searchQuery).toBe("");
  });

  it("renders LayerFilterBar controls above the canvas when graph is loaded (AC-2)", () => {
    const mockGraph = {
      schemaVersion: 1,
      repository: {
        id: "repo:org/app",
        owner: "org",
        name: "app",
        fullName: "org/app",
        defaultBranch: "main",
        commitSha: "sha1",
        analyzedAt: new Date().toISOString(),
        totalFiles: 1,
        totalSymbols: 0,
        languages: { typescript: 1 },
        schemaVersion: 1,
      },
      directories: {},
      files: {
        "file:src/components/button.tsx": {
          id: "file:src/components/button.tsx",
          path: "src/components/button.tsx",
          name: "button.tsx",
          extension: ".tsx",
          language: "typescript",
          sizeBytes: 200,
          lineCount: 15,
          directoryId: "dir:src/components",
          symbolIds: [],
          importIds: [],
          exportIds: [],
        },
      },
      symbols: {},
      externalModules: {},
      edges: {},
    } as unknown as CodebaseGraph;

    useGraphStore.getState().setGraph(mockGraph);
    render(<ArchitectureCanvas />);

    expect(screen.getByTestId("layer-filter-bar")).toBeInTheDocument();
  });

  it("coordinates LayerFilterBar and GraphControlsToolbar in a shared flex container to prevent overlap", () => {
    const mockGraph = {
      schemaVersion: 1,
      repository: {
        id: "repo:org/app",
        owner: "org",
        name: "app",
        fullName: "org/app",
        defaultBranch: "main",
        commitSha: "sha1",
        analyzedAt: new Date().toISOString(),
        totalFiles: 1,
        totalSymbols: 0,
        languages: { typescript: 1 },
        schemaVersion: 1,
      },
      directories: {},
      files: {
        "file:src/components/button.tsx": {
          id: "file:src/components/button.tsx",
          path: "src/components/button.tsx",
          name: "button.tsx",
          extension: ".tsx",
          language: "typescript",
          sizeBytes: 200,
          lineCount: 15,
          directoryId: "dir:src/components",
          symbolIds: [],
          importIds: [],
          exportIds: [],
        },
      },
      symbols: {},
      externalModules: {},
      edges: {},
    } as unknown as CodebaseGraph;

    useGraphStore.getState().setGraph(mockGraph);
    const { rerender } = render(<ArchitectureCanvas />);

    const nav = screen.getByRole("navigation", {
      name: "Architectural filter and canvas controls",
    });
    const toolbar = screen.getByRole("toolbar", {
      name: "Canvas zoom and view controls",
    });

    expect(nav).toBeInTheDocument();
    expect(toolbar).toBeInTheDocument();

    // Verify both are housed in a shared flex container preventing horizontal overlap
    const controlsContainer = nav.closest(".pointer-events-none");
    expect(controlsContainer).toBeInTheDocument();
    expect(controlsContainer).toHaveClass("flex", "justify-between", "gap-3");
    expect(controlsContainer).toContainElement(toolbar);

    // Toolbar wrapper must not shrink
    const toolbarWrapper = toolbar.parentElement;
    expect(toolbarWrapper).toHaveClass("shrink-0");

    // Nav wrapper must have min-w-0 to allow flex shrinking and scroll containment
    const navWrapper = nav.parentElement;
    expect(navWrapper).toHaveClass("min-w-0");

    // When right panel collapses, container adjusts right margin to avoid expand toggle button
    act(() => {
      useWorkspaceStore.getState().setRightPanelCollapsed(true);
    });
    rerender(<ArchitectureCanvas />);
    expect(controlsContainer).toHaveClass("right-12");

    // When left sidebar collapses, container adjusts left margin to avoid expand toggle button
    act(() => {
      useWorkspaceStore.getState().setLeftSidebarCollapsed(true);
    });
    rerender(<ArchitectureCanvas />);
    expect(controlsContainer).toHaveClass("left-12");
  });

  it("preserves graph responsiveness and updates selection without unmounting canvas elements", () => {
    const mockGraph = {
      schemaVersion: 1,
      repository: {
        id: "repo:org/app",
        owner: "org",
        name: "app",
        fullName: "org/app",
        defaultBranch: "main",
        commitSha: "sha1",
        analyzedAt: new Date().toISOString(),
        totalFiles: 2,
        totalSymbols: 0,
        languages: { typescript: 2 },
        schemaVersion: 1,
      },
      directories: {},
      files: {
        "file:src/a.ts": {
          id: "file:src/a.ts",
          path: "src/a.ts",
          name: "a.ts",
          extension: ".ts",
          language: "typescript",
          sizeBytes: 100,
          lineCount: 10,
          directoryId: "dir:src",
          symbolIds: [],
          importIds: [],
          exportIds: [],
        },
        "file:src/b.ts": {
          id: "file:src/b.ts",
          path: "src/b.ts",
          name: "b.ts",
          extension: ".ts",
          language: "typescript",
          sizeBytes: 100,
          lineCount: 10,
          directoryId: "dir:src",
          symbolIds: [],
          importIds: [],
          exportIds: [],
        },
      },
      symbols: {},
      externalModules: {},
      edges: {
        "edge:a-b": {
          id: "edge:a-b",
          sourceId: "file:src/a.ts",
          targetId: "file:src/b.ts",
          kind: "file_import",
          weight: 1,
          isExternal: false,
        },
      },
    } as unknown as CodebaseGraph;

    useGraphStore.getState().setGraph(mockGraph);
    render(<ArchitectureCanvas />);

    expect(screen.getByTestId("architecture-canvas")).toBeInTheDocument();

    act(() => {
      useGraphStore.getState().selectNode("file:src/a.ts");
    });

    expect(useGraphStore.getState().selectedNodeId).toBe("file:src/a.ts");
    expect(useGraphStore.getState().activeTarget?.fileId).toBe("file:src/a.ts");

    act(() => {
      useGraphStore.getState().setHoveredNodeId("file:src/b.ts");
    });

    expect(useGraphStore.getState().hoveredNodeId).toBe("file:src/b.ts");
  });

  it("applies high contrast hex colors and marker configuration to active outgoing and incoming edges", () => {
    const mockGraph = {
      schemaVersion: 1,
      repository: {
        id: "repo:org/app",
        owner: "org",
        name: "app",
        fullName: "org/app",
        defaultBranch: "main",
        commitSha: "sha1",
        analyzedAt: new Date().toISOString(),
        totalFiles: 4,
        totalSymbols: 0,
        languages: { typescript: 4 },
        schemaVersion: 1,
      },
      directories: {},
      files: {
        "file:src/a.ts": {
          id: "file:src/a.ts",
          path: "src/a.ts",
          name: "a.ts",
          extension: ".ts",
          language: "typescript",
          sizeBytes: 100,
          lineCount: 10,
          directoryId: "dir:src",
          symbolIds: [],
          importIds: [],
          exportIds: [],
        },
        "file:src/b.ts": {
          id: "file:src/b.ts",
          path: "src/b.ts",
          name: "b.ts",
          extension: ".ts",
          language: "typescript",
          sizeBytes: 100,
          lineCount: 10,
          directoryId: "dir:src",
          symbolIds: [],
          importIds: [],
          exportIds: [],
        },
        "file:src/c.ts": {
          id: "file:src/c.ts",
          path: "src/c.ts",
          name: "c.ts",
          extension: ".ts",
          language: "typescript",
          sizeBytes: 100,
          lineCount: 10,
          directoryId: "dir:src",
          symbolIds: [],
          importIds: [],
          exportIds: [],
        },
        "file:src/d.ts": {
          id: "file:src/d.ts",
          path: "src/d.ts",
          name: "d.ts",
          extension: ".ts",
          language: "typescript",
          sizeBytes: 100,
          lineCount: 10,
          directoryId: "dir:src",
          symbolIds: [],
          importIds: [],
          exportIds: [],
        },
      },
      symbols: {},
      externalModules: {},
      edges: {
        "edge:a-b": {
          id: "edge:file:src/a.ts->file:src/b.ts:file_import",
          sourceId: "file:src/a.ts",
          targetId: "file:src/b.ts",
          kind: "file_import",
          weight: 1,
          isExternal: false,
        },
        "edge:c-d": {
          id: "edge:file:src/c.ts->file:src/d.ts:file_import",
          sourceId: "file:src/c.ts",
          targetId: "file:src/d.ts",
          kind: "file_import",
          weight: 1,
          isExternal: false,
        },
      },
    } as unknown as CodebaseGraph;

    useGraphStore.getState().setGraph(mockGraph);
    render(<ArchitectureCanvas />);

    // 1. Initial idle edge state
    expect(capturedReactFlowProps).not.toBeNull();
    const idleEdges = (capturedReactFlowProps?.edges ?? []) as Edge[];
    const idleEdgeAB = idleEdges.find(
      (e: Edge) => e.source === "file:src/a.ts",
    );
    expect(idleEdgeAB).toBeDefined();
    expect(idleEdgeAB?.style?.stroke).toBe("#475569");
    const idleMarker = idleEdgeAB?.markerEnd as { color?: string } | undefined;
    expect(idleMarker?.color).toBe("rgba(100, 116, 139, 0.6)");
    // Ensure marker colors use valid hex without CSS var syntax that corrupts SVG marker URLs
    expect(idleMarker?.color).not.toContain("var(");

    // ReactFlow should receive the colorMode property
    expect(capturedReactFlowProps?.colorMode).toBeDefined();

    // 2. Select node A: edge A->B becomes active outgoing
    act(() => {
      useGraphStore.getState().selectNode("file:src/a.ts");
    });

    const activeEdgesA = (capturedReactFlowProps?.edges ?? []) as Edge[];
    const outgoingEdge = activeEdgesA.find(
      (e: Edge) => e.source === "file:src/a.ts",
    );
    const dimmedEdge = activeEdgesA.find(
      (e: Edge) => e.source === "file:src/c.ts",
    );

    expect(outgoingEdge).toBeDefined();
    expect(outgoingEdge?.animated).toBe(true);
    expect(outgoingEdge?.style?.stroke).toBe("#38bdf8");
    expect(outgoingEdge?.style?.strokeWidth).toBe(3);
    expect(outgoingEdge?.style?.strokeOpacity).toBe(1);
    expect(outgoingEdge?.style?.filter).toContain("drop-shadow");
    const outgoingMarker = outgoingEdge?.markerEnd as
      { color?: string } | undefined;
    expect(outgoingMarker?.color).toBe("#38bdf8");
    expect(outgoingMarker?.color).not.toContain("var(");

    expect(dimmedEdge).toBeDefined();
    expect(dimmedEdge?.animated).toBe(false);
    expect(dimmedEdge?.style?.stroke).toBe("#1e293b");
    expect(dimmedEdge?.style?.strokeOpacity).toBe(0.2);
    const dimmedMarker = dimmedEdge?.markerEnd as
      { color?: string } | undefined;
    expect(dimmedMarker?.color).toBe("rgba(51, 65, 85, 0.2)");

    // 3. Select node B: edge A->B becomes active incoming
    act(() => {
      useGraphStore.getState().selectNode("file:src/b.ts");
    });

    const activeEdgesB = (capturedReactFlowProps?.edges ?? []) as Edge[];
    const incomingEdge = activeEdgesB.find(
      (e: Edge) => e.target === "file:src/b.ts",
    );
    expect(incomingEdge).toBeDefined();
    expect(incomingEdge?.animated).toBe(true);
    expect(incomingEdge?.style?.stroke).toBe("#a78bfa");
    expect(incomingEdge?.style?.strokeWidth).toBe(2.5);
    expect(incomingEdge?.style?.strokeOpacity).toBe(1);
    const incomingMarker = incomingEdge?.markerEnd as
      { color?: string } | undefined;
    expect(incomingMarker?.color).toBe("#a78bfa");
    expect(incomingMarker?.color).not.toContain("var(");

    // 4. Advance past navigation time lock and navigate to an inner symbol from editor
    act(() => {
      useGraphStore.setState({ lockedUntil: 0 });
      useGraphStore.getState().navigateToTarget({
        fileId: "file:src/a.ts",
        symbolId: "symbol:src/a.ts#handleClick",
        line: 8,
        column: 4,
        source: "editor",
        timestamp: Date.now() + 500,
      });
    });

    const activeEdgesFromEditor = (capturedReactFlowProps?.edges ??
      []) as Edge[];
    const outgoingEdgeFromEditor = activeEdgesFromEditor.find(
      (e: Edge) => e.source === "file:src/a.ts",
    );
    // The connecting arrow must stay active and clearly visible, not dimmed to 0.2 stroke opacity
    expect(outgoingEdgeFromEditor).toBeDefined();
    expect(outgoingEdgeFromEditor?.animated).toBe(true);
    expect(outgoingEdgeFromEditor?.style?.stroke).toBe("#38bdf8");
    expect(outgoingEdgeFromEditor?.style?.strokeWidth).toBe(3);
    expect(outgoingEdgeFromEditor?.style?.strokeOpacity).toBe(1);
    const editorMarker = outgoingEdgeFromEditor?.markerEnd as
      { color?: string } | undefined;
    expect(editorMarker?.color).toBe("#38bdf8");

    // 5. Regression: edge alpha must live in the stroke paint, never in element opacity.
    // Element opacity on a path that also carries an arrow marker forces the rasterizer to
    // allocate an offscreen layer per edge on every zoom frame, which drops zoom out to ~22 FPS.
    const expectPaintLevelAlphaOnly = (edges: readonly Edge[]): void => {
      expect(edges.length).toBeGreaterThan(0);
      for (const edge of edges) {
        expect(edge.style?.opacity).toBeUndefined();
        expect(typeof edge.style?.strokeOpacity).toBe("number");
      }
    };
    expectPaintLevelAlphaOnly(idleEdges);
    expectPaintLevelAlphaOnly(activeEdgesA);
    expectPaintLevelAlphaOnly(activeEdgesB);
    expectPaintLevelAlphaOnly(activeEdgesFromEditor);

    act(() => {
      useGraphStore.getState().setActiveTrace({
        id: "trace:file:src/a.ts->file:src/b.ts",
        sourceNodeId: "file:src/a.ts",
        targetNodeId: "file:src/b.ts",
        stepNodeIds: Object.freeze(["file:src/a.ts", "file:src/b.ts"]),
        stepEdgeIds: Object.freeze([
          "edge:file:src/a.ts->file:src/b.ts:file_import",
        ]),
        hopCount: 1,
        rationale: "test trace",
        createdAt: new Date().toISOString(),
      });
    });
    const traceEdges = (capturedReactFlowProps?.edges ?? []) as Edge[];
    const traceEdge = traceEdges.find(
      (e: Edge) => e.source === "file:src/a.ts",
    );
    const traceDimmedEdge = traceEdges.find(
      (e: Edge) => e.source === "file:src/c.ts",
    );
    expect(traceEdge?.style?.strokeOpacity).toBe(1);
    expect(traceDimmedEdge?.style?.strokeOpacity).toBe(0.15);
    expectPaintLevelAlphaOnly(traceEdges);
  });

  it("renders internal local import edges between TSX files and highlights connected nodes", () => {
    const mockGraph = {
      schemaVersion: 1,
      repository: {
        id: "repo:org/app",
        owner: "org",
        name: "app",
        fullName: "org/app",
        defaultBranch: "main",
        commitSha: "sha1",
        analyzedAt: new Date().toISOString(),
        totalFiles: 2,
        totalSymbols: 1,
        languages: { typescript: 2 },
        schemaVersion: 1,
      },
      directories: {
        "dir:src": {
          id: "dir:src",
          path: "src",
          name: "src",
          parentDirId: null,
          childDirIds: [],
          childFileIds: ["file:src/App.tsx", "file:src/Button.tsx"],
        },
      },
      files: {
        "file:src/App.tsx": {
          id: "file:src/App.tsx",
          path: "src/App.tsx",
          name: "App.tsx",
          extension: ".tsx",
          language: "typescript",
          sizeBytes: 150,
          lineCount: 15,
          directoryId: "dir:src",
          symbolIds: [],
          importIds: [
            "file:src/Button.tsx",
            "symbol:src/Button.tsx#Button",
            "ext:react",
          ],
          exportIds: [],
        },
        "file:src/Button.tsx": {
          id: "file:src/Button.tsx",
          path: "src/Button.tsx",
          name: "Button.tsx",
          extension: ".tsx",
          language: "typescript",
          sizeBytes: 120,
          lineCount: 12,
          directoryId: "dir:src",
          symbolIds: ["symbol:src/Button.tsx#Button"],
          importIds: ["ext:react"],
          exportIds: ["symbol:src/Button.tsx#Button"],
        },
      },
      symbols: {
        "symbol:src/Button.tsx#Button": {
          id: "symbol:src/Button.tsx#Button",
          fileId: "file:src/Button.tsx",
          parentSymbolId: null,
          name: "Button",
          kind: "function",
          range: {
            start: { line: 1, column: 0 },
            end: { line: 5, column: 1 },
          },
          selectionRange: {
            start: { line: 1, column: 16 },
            end: { line: 1, column: 22 },
          },
          isExported: true,
          isDefaultExport: true,
          childSymbolIds: [],
        },
      },
      externalModules: {
        "ext:react": {
          id: "ext:react",
          name: "react",
          isExternal: true,
        },
      },
      edges: {
        "edge:app->button": {
          id: "edge:file:src/App.tsx->file:src/Button.tsx:file_import",
          sourceId: "file:src/App.tsx",
          targetId: "file:src/Button.tsx",
          kind: "file_import",
          weight: 1,
          isExternal: false,
        },
        "edge:app->button-sym": {
          id: "edge:file:src/App.tsx->symbol:src/Button.tsx#Button:file_import",
          sourceId: "file:src/App.tsx",
          targetId: "symbol:src/Button.tsx#Button",
          kind: "file_import",
          weight: 1,
          isExternal: false,
        },
        "edge:app->react": {
          id: "edge:file:src/App.tsx->ext:react:file_import",
          sourceId: "file:src/App.tsx",
          targetId: "ext:react",
          kind: "file_import",
          weight: 1,
          isExternal: true,
        },
      },
    } as unknown as CodebaseGraph;

    useGraphStore.getState().setGraph(mockGraph);
    render(<ArchitectureCanvas />);

    expect(capturedReactFlowProps).not.toBeNull();
    const renderedEdges = (capturedReactFlowProps?.edges ?? []) as Edge[];

    // 1. Must contain an internal file-to-file edge between App.tsx and Button.tsx
    const internalEdge = renderedEdges.find(
      (e: Edge) =>
        e.source === "file:src/App.tsx" && e.target === "file:src/Button.tsx",
    );
    expect(internalEdge).toBeDefined();
    expect(internalEdge?.data?.isExternal).toBe(false);

    // 2. Must also contain external edge to react
    const externalEdge = renderedEdges.find(
      (e: Edge) => e.source === "file:src/App.tsx" && e.target === "ext:react",
    );
    expect(externalEdge).toBeDefined();
    expect(externalEdge?.data?.isExternal).toBe(true);

    // 3. Selecting Button.tsx highlights the internal incoming edge from App.tsx
    act(() => {
      useGraphStore.getState().selectNode("file:src/Button.tsx");
    });

    const edgesAfterButtonSelect = (capturedReactFlowProps?.edges ??
      []) as Edge[];
    const activeIncoming = edgesAfterButtonSelect.find(
      (e: Edge) =>
        e.source === "file:src/App.tsx" && e.target === "file:src/Button.tsx",
    );
    expect(activeIncoming?.animated).toBe(true);
    expect(activeIncoming?.style?.stroke).toBe("#a78bfa");

    // Connected file node App.tsx should not be dimmed
    const renderedNodes = capturedReactFlowProps?.nodes ?? [];
    const appNode = renderedNodes.find((n) => n.id === "file:src/App.tsx");
    expect(appNode?.data?.isConnected).toBe(true);
    expect(appNode?.data?.isDimmed).toBe(false);
  });

  it("enables viewport pruning via onlyRenderVisibleElements prop on ReactFlow (AC-1)", () => {
    const mockGraph = {
      schemaVersion: 1,
      repository: {
        id: "repo:org/app",
        owner: "org",
        name: "app",
        fullName: "org/app",
        defaultBranch: "main",
        commitSha: "sha1",
        analyzedAt: new Date().toISOString(),
        totalFiles: 1,
        totalSymbols: 0,
        languages: { typescript: 1 },
        schemaVersion: 1,
      },
      directories: {},
      files: {
        "file:src/main.ts": {
          id: "file:src/main.ts",
          path: "src/main.ts",
          name: "main.ts",
          extension: ".ts",
          language: "typescript",
          sizeBytes: 200,
          lineCount: 15,
          directoryId: "dir:src",
          symbolIds: [],
          importIds: [],
          exportIds: [],
        },
      },
      symbols: {},
      externalModules: {},
      edges: {},
    } as unknown as CodebaseGraph;

    useGraphStore.getState().setGraph(mockGraph);
    render(<ArchitectureCanvas />);

    expect(capturedReactFlowProps?.onlyRenderVisibleElements).toBe(true);
  });

  it("does not trigger full canvas re-render or regenerate node objects when hovering a node (AC-2)", () => {
    const mockGraph = {
      schemaVersion: 1,
      repository: {
        id: "repo:org/app",
        owner: "org",
        name: "app",
        fullName: "org/app",
        defaultBranch: "main",
        commitSha: "sha1",
        analyzedAt: new Date().toISOString(),
        totalFiles: 2,
        totalSymbols: 0,
        languages: { typescript: 2 },
        schemaVersion: 1,
      },
      directories: {},
      files: {
        "file:src/a.ts": {
          id: "file:src/a.ts",
          path: "src/a.ts",
          name: "a.ts",
          extension: ".ts",
          language: "typescript",
          sizeBytes: 200,
          lineCount: 15,
          directoryId: "dir:src",
          symbolIds: [],
          importIds: [],
          exportIds: [],
        },
        "file:src/b.ts": {
          id: "file:src/b.ts",
          path: "src/b.ts",
          name: "b.ts",
          extension: ".ts",
          language: "typescript",
          sizeBytes: 150,
          lineCount: 10,
          directoryId: "dir:src",
          symbolIds: [],
          importIds: [],
          exportIds: [],
        },
      },
      symbols: {},
      externalModules: {},
      edges: {},
    } as unknown as CodebaseGraph;

    useGraphStore.getState().setGraph(mockGraph);
    render(<ArchitectureCanvas />);

    const initialRenderedNodes = capturedReactFlowProps?.nodes;

    // Hovering node B updates store state atomically
    act(() => {
      useGraphStore.getState().setHoveredNodeId("file:src/b.ts");
    });

    expect(useGraphStore.getState().hoveredNodeId).toBe("file:src/b.ts");

    // The canvas nodes array reference is preserved because hover does not trigger canvas setNodes
    expect(capturedReactFlowProps?.nodes).toBe(initialRenderedNodes);
  });

  it("hides symbol nodes below zoom 1.2 and reveals them with throttling when zooming in (AC-3, AC-4)", () => {
    vi.useFakeTimers();

    const mockGraph = {
      schemaVersion: 1,
      repository: {
        id: "repo:org/app",
        owner: "org",
        name: "app",
        fullName: "org/app",
        defaultBranch: "main",
        commitSha: "sha1",
        analyzedAt: new Date().toISOString(),
        totalFiles: 1,
        totalSymbols: 1,
        languages: { typescript: 1 },
        schemaVersion: 1,
      },
      directories: {},
      files: {
        "file:src/service.ts": {
          id: "file:src/service.ts",
          path: "src/service.ts",
          name: "service.ts",
          extension: ".ts",
          language: "typescript",
          sizeBytes: 200,
          lineCount: 15,
          directoryId: "dir:src",
          symbolIds: ["symbol:src/service.ts#doWork"],
          importIds: [],
          exportIds: [],
        },
      },
      symbols: {
        "symbol:src/service.ts#doWork": {
          id: "symbol:src/service.ts#doWork",
          fileId: "file:src/service.ts",
          parentSymbolId: null,
          name: "doWork",
          kind: "function",
          range: {
            startOffset: 0,
            endOffset: 30,
            startLine: 1,
            startColumn: 1,
            endLine: 3,
            endColumn: 2,
          },
          selectionRange: {
            startOffset: 0,
            endOffset: 6,
            startLine: 1,
            startColumn: 1,
            endLine: 1,
            endColumn: 7,
          },
          isExported: true,
          isDefaultExport: false,
          signature: "export function doWork(): void",
          documentation: null,
          visibility: "public",
          childSymbolIds: [],
        },
      },
      externalModules: {},
      edges: {},
    } as unknown as CodebaseGraph;

    useGraphStore.getState().setGraph(mockGraph);
    render(<ArchitectureCanvas />);

    // 1. At default zoom (1.0 < 1.2), symbol nodes are hidden
    const initialNodes = capturedReactFlowProps?.nodes ?? [];
    const symbolNodeInitial = initialNodes.find(
      (n) => n.id === "symbol:src/service.ts#doWork",
    );
    expect(symbolNodeInitial).toBeDefined();
    expect(symbolNodeInitial?.hidden).toBe(true);

    // 2. Zoom in past 1.2 threshold (e.g. 1.4)
    expect(capturedViewportChangeHandler).toBeDefined();
    act(() => {
      capturedViewportChangeHandler!({ x: 0, y: 0, zoom: 1.4 });
    });

    // Before throttle expires (within 75ms), symbols should still be hidden
    act(() => {
      vi.advanceTimersByTime(30);
    });
    const midNodes = capturedReactFlowProps?.nodes ?? [];
    const symbolNodeMid = midNodes.find(
      (n) => n.id === "symbol:src/service.ts#doWork",
    );
    expect(symbolNodeMid?.hidden).toBe(true);

    // Advance past throttle duration (75ms total)
    act(() => {
      vi.advanceTimersByTime(50);
    });

    // Symbol node is now revealed
    const zoomedNodes = capturedReactFlowProps?.nodes ?? [];
    const symbolNodeRevealed = zoomedNodes.find(
      (n) => n.id === "symbol:src/service.ts#doWork",
    );
    expect(symbolNodeRevealed?.hidden).toBe(false);

    // 3. Zoom back out below 1.2 threshold
    act(() => {
      capturedViewportChangeHandler!({ x: 0, y: 0, zoom: 0.8 });
      vi.advanceTimersByTime(75);
    });

    const zoomedOutNodes = capturedReactFlowProps?.nodes ?? [];
    const symbolNodeHiddenAgain = zoomedOutNodes.find(
      (n) => n.id === "symbol:src/service.ts#doWork",
    );
    expect(symbolNodeHiddenAgain?.hidden).toBe(true);

    vi.useRealTimers();
  });

  it("throttles rapid viewport zoom fluctuations across threshold to avoid layout jitter (AC-4)", () => {
    vi.useFakeTimers();

    const mockGraph = {
      schemaVersion: 1,
      repository: {
        id: "repo:org/app",
        owner: "org",
        name: "app",
        fullName: "org/app",
        defaultBranch: "main",
        commitSha: "sha1",
        analyzedAt: new Date().toISOString(),
        totalFiles: 1,
        totalSymbols: 1,
        languages: { typescript: 1 },
        schemaVersion: 1,
      },
      directories: {},
      files: {
        "file:src/service.ts": {
          id: "file:src/service.ts",
          path: "src/service.ts",
          name: "service.ts",
          extension: ".ts",
          language: "typescript",
          sizeBytes: 200,
          lineCount: 15,
          directoryId: "dir:src",
          symbolIds: ["symbol:src/service.ts#doWork"],
          importIds: [],
          exportIds: [],
        },
      },
      symbols: {
        "symbol:src/service.ts#doWork": {
          id: "symbol:src/service.ts#doWork",
          fileId: "file:src/service.ts",
          parentSymbolId: null,
          name: "doWork",
          kind: "function",
          range: {
            startOffset: 0,
            endOffset: 30,
            startLine: 1,
            startColumn: 1,
            endLine: 3,
            endColumn: 2,
          },
          selectionRange: {
            startOffset: 0,
            endOffset: 6,
            startLine: 1,
            startColumn: 1,
            endLine: 1,
            endColumn: 7,
          },
          isExported: true,
          isDefaultExport: false,
          signature: "export function doWork(): void",
          documentation: null,
          visibility: "public",
          childSymbolIds: [],
        },
      },
      externalModules: {},
      edges: {},
    } as unknown as CodebaseGraph;

    useGraphStore.getState().setGraph(mockGraph);
    render(<ArchitectureCanvas />);

    act(() => {
      capturedViewportChangeHandler!({ x: 0, y: 0, zoom: 1.4 });
      vi.advanceTimersByTime(10);
      capturedViewportChangeHandler!({ x: 0, y: 0, zoom: 0.9 });
      vi.advanceTimersByTime(10);
      capturedViewportChangeHandler!({ x: 0, y: 0, zoom: 1.5 });
      vi.advanceTimersByTime(10);
    });

    const midNodes = capturedReactFlowProps?.nodes ?? [];
    const symbolNode = midNodes.find(
      (n) => n.id === "symbol:src/service.ts#doWork",
    );
    expect(symbolNode?.hidden).toBe(true);

    act(() => {
      vi.advanceTimersByTime(80);
    });

    const finalNodes = capturedReactFlowProps?.nodes ?? [];
    const symbolFinal = finalNodes.find(
      (n) => n.id === "symbol:src/service.ts#doWork",
    );
    expect(symbolFinal?.hidden).toBe(false);

    vi.useRealTimers();
  });

  it("prevents race condition when zooming in and immediately zooming out before throttle fires (AC-3, AC-4)", () => {
    vi.useFakeTimers();

    const mockGraph = {
      schemaVersion: 1,
      repository: {
        id: "repo:org/app",
        owner: "org",
        name: "app",
        fullName: "org/app",
        defaultBranch: "main",
        commitSha: "sha1",
        analyzedAt: new Date().toISOString(),
        totalFiles: 1,
        totalSymbols: 1,
        languages: { typescript: 1 },
        schemaVersion: 1,
      },
      directories: {},
      files: {
        "file:src/service.ts": {
          id: "file:src/service.ts",
          path: "src/service.ts",
          name: "service.ts",
          extension: ".ts",
          language: "typescript",
          sizeBytes: 200,
          lineCount: 15,
          directoryId: "dir:src",
          symbolIds: ["symbol:src/service.ts#doWork"],
          importIds: [],
          exportIds: [],
        },
      },
      symbols: {
        "symbol:src/service.ts#doWork": {
          id: "symbol:src/service.ts#doWork",
          fileId: "file:src/service.ts",
          parentSymbolId: null,
          name: "doWork",
          kind: "function",
          range: {
            startOffset: 0,
            endOffset: 30,
            startLine: 1,
            startColumn: 1,
            endLine: 3,
            endColumn: 2,
          },
          selectionRange: {
            startOffset: 0,
            endOffset: 6,
            startLine: 1,
            startColumn: 1,
            endLine: 1,
            endColumn: 7,
          },
          isExported: true,
          isDefaultExport: false,
          signature: "export function doWork(): void",
          documentation: null,
          visibility: "public",
          childSymbolIds: [],
        },
      },
      externalModules: {},
      edges: {},
    } as unknown as CodebaseGraph;

    useGraphStore.getState().setGraph(mockGraph);
    render(<ArchitectureCanvas />);

    // Fast zoom in (>= 1.2) followed immediately (within 75ms) by zoom out (< 1.2)
    act(() => {
      capturedViewportChangeHandler!({ x: 0, y: 0, zoom: 1.4 });
      vi.advanceTimersByTime(20);
      capturedViewportChangeHandler!({ x: 0, y: 0, zoom: 0.8 });
      vi.advanceTimersByTime(100);
    });

    const finalNodes = capturedReactFlowProps?.nodes ?? [];
    const symbolFinal = finalNodes.find(
      (n) => n.id === "symbol:src/service.ts#doWork",
    );
    expect(symbolFinal?.hidden).toBe(true);

    vi.useRealTimers();
  });

  it("clears pending zoom throttle timer when underlying graph is reloaded or recomputed (AC-3, AC-4)", () => {
    vi.useFakeTimers();

    const mockGraph1 = {
      schemaVersion: 1,
      repository: {
        id: "repo:org/app",
        owner: "org",
        name: "app",
        fullName: "org/app",
        defaultBranch: "main",
        commitSha: "sha1",
        analyzedAt: new Date().toISOString(),
        totalFiles: 1,
        totalSymbols: 1,
        languages: { typescript: 1 },
        schemaVersion: 1,
      },
      directories: {},
      files: {
        "file:src/service.ts": {
          id: "file:src/service.ts",
          path: "src/service.ts",
          name: "service.ts",
          extension: ".ts",
          language: "typescript",
          sizeBytes: 200,
          lineCount: 15,
          directoryId: "dir:src",
          symbolIds: ["symbol:src/service.ts#doWork"],
          importIds: [],
          exportIds: [],
        },
      },
      symbols: {
        "symbol:src/service.ts#doWork": {
          id: "symbol:src/service.ts#doWork",
          fileId: "file:src/service.ts",
          parentSymbolId: null,
          name: "doWork",
          kind: "function",
          range: {
            startOffset: 0,
            endOffset: 30,
            startLine: 1,
            startColumn: 1,
            endLine: 3,
            endColumn: 2,
          },
          selectionRange: {
            startOffset: 0,
            endOffset: 6,
            startLine: 1,
            startColumn: 1,
            endLine: 1,
            endColumn: 7,
          },
          isExported: true,
          isDefaultExport: false,
          signature: "export function doWork(): void",
          documentation: null,
          visibility: "public",
          childSymbolIds: [],
        },
      },
      externalModules: {},
      edges: {},
    } as unknown as CodebaseGraph;

    useGraphStore.getState().setGraph(mockGraph1);
    render(<ArchitectureCanvas />);

    // Zoom in triggers pending 75ms throttle
    act(() => {
      capturedViewportChangeHandler!({ x: 0, y: 0, zoom: 1.5 });
      vi.advanceTimersByTime(20);
    });

    // Before timer fires, graph changes to a new graph
    const mockGraph2 = {
      ...mockGraph1,
      repository: { ...mockGraph1.repository, commitSha: "sha2" },
    };

    act(() => {
      useGraphStore.getState().setGraph(mockGraph2);
    });

    // Advance past original 75ms timer
    act(() => {
      vi.advanceTimersByTime(100);
    });

    const nodes = capturedReactFlowProps?.nodes ?? [];
    const symbolNode = nodes.find(
      (n) => n.id === "symbol:src/service.ts#doWork",
    );
    // At default zoom 1.0 (< 1.2), symbol remains hidden, not revealed by stale timer
    expect(symbolNode?.hidden).toBe(true);

    vi.useRealTimers();
  });

  it("cleans up pending zoom throttle timer without errors when unmounting (AC-4)", () => {
    vi.useFakeTimers();

    const mockGraph = {
      schemaVersion: 1,
      repository: {
        id: "repo:org/app",
        owner: "org",
        name: "app",
        fullName: "org/app",
        defaultBranch: "main",
        commitSha: "sha1",
        analyzedAt: new Date().toISOString(),
        totalFiles: 1,
        totalSymbols: 0,
        languages: { typescript: 1 },
        schemaVersion: 1,
      },
      directories: {},
      files: {},
      symbols: {},
      externalModules: {},
      edges: {},
    } as unknown as CodebaseGraph;

    useGraphStore.getState().setGraph(mockGraph);
    const { unmount } = render(<ArchitectureCanvas />);

    act(() => {
      capturedViewportChangeHandler!({ x: 0, y: 0, zoom: 1.5 });
      vi.advanceTimersByTime(20);
    });

    unmount();

    expect(() => {
      act(() => {
        vi.advanceTimersByTime(100);
      });
    }).not.toThrow();

    vi.useRealTimers();
  });

  it("centers camera and zooms to 1.2 when navigation originates from folder tree", () => {
    const mockGraph = {
      schemaVersion: 1,
      repository: {
        id: "repo:org/app",
        owner: "org",
        name: "app",
        fullName: "org/app",
        defaultBranch: "main",
        commitSha: "sha1",
        analyzedAt: new Date().toISOString(),
        totalFiles: 1,
        totalSymbols: 0,
        languages: { typescript: 1 },
        schemaVersion: 1,
      },
      directories: {},
      files: {
        "file:src/index.ts": {
          id: "file:src/index.ts",
          path: "src/index.ts",
          name: "index.ts",
          extension: ".ts",
          language: "typescript",
          sizeBytes: 120,
          lineCount: 10,
          directoryId: "dir:src",
          symbolIds: [],
          importIds: [],
          exportIds: [],
        },
      },
      symbols: {},
      externalModules: {},
      edges: {},
    } as unknown as CodebaseGraph;

    useGraphStore.getState().setGraph(mockGraph);
    render(<ArchitectureCanvas />);

    act(() => {
      useGraphStore.getState().revealNode("file:src/index.ts", "tree");
    });

    expect(mockSetCenter).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(Number),
      expect.objectContaining({ zoom: 1.2, duration: 800 }),
    );
  });

  it("prioritizes file node over symbol node when navigating from editor", () => {
    const mockGraph = {
      schemaVersion: 1,
      repository: {
        id: "repo:org/app",
        owner: "org",
        name: "app",
        fullName: "org/app",
        defaultBranch: "main",
        commitSha: "sha1",
        analyzedAt: new Date().toISOString(),
        totalFiles: 1,
        totalSymbols: 1,
        languages: { typescript: 1 },
        schemaVersion: 1,
      },
      directories: {},
      files: {
        "file:src/button.tsx": {
          id: "file:src/button.tsx",
          path: "src/button.tsx",
          name: "button.tsx",
          extension: ".tsx",
          language: "typescript",
          sizeBytes: 200,
          lineCount: 15,
          directoryId: "dir:src",
          symbolIds: ["symbol:src/button.tsx#Button"],
          importIds: [],
          exportIds: [],
        },
      },
      symbols: {
        "symbol:src/button.tsx#Button": {
          id: "symbol:src/button.tsx#Button",
          fileId: "file:src/button.tsx",
          parentSymbolId: null,
          name: "Button",
          kind: "function",
          range: {
            start: { line: 1, column: 0 },
            end: { line: 5, column: 1 },
          },
          selectionRange: {
            start: { line: 1, column: 16 },
            end: { line: 1, column: 22 },
          },
          isExported: true,
          isDefaultExport: true,
          childSymbolIds: [],
        },
      },
      externalModules: {},
      edges: {},
    } as unknown as CodebaseGraph;

    useGraphStore.getState().setGraph(mockGraph);
    render(<ArchitectureCanvas />);

    act(() => {
      useGraphStore.getState().navigateToTarget({
        fileId: "file:src/button.tsx",
        symbolId: "symbol:src/button.tsx#Button",
        source: "editor",
        timestamp: Date.now(),
      });
    });

    expect(mockSetCenter).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(Number),
      expect.objectContaining({ zoom: 1.2, duration: 800 }),
    );
  });

  it("re-centers camera when zoomed out and editor is clicked again", () => {
    const mockGraph = {
      schemaVersion: 1,
      repository: {
        id: "repo:org/app",
        owner: "org",
        name: "app",
        fullName: "org/app",
        defaultBranch: "main",
        commitSha: "sha1",
        analyzedAt: new Date().toISOString(),
        totalFiles: 1,
        totalSymbols: 0,
        languages: { typescript: 1 },
        schemaVersion: 1,
      },
      directories: {},
      files: {
        "file:src/app.ts": {
          id: "file:src/app.ts",
          path: "src/app.ts",
          name: "app.ts",
          extension: ".ts",
          language: "typescript",
          sizeBytes: 150,
          lineCount: 12,
          directoryId: "dir:src",
          symbolIds: [],
          importIds: [],
          exportIds: [],
        },
      },
      symbols: {},
      externalModules: {},
      edges: {},
    } as unknown as CodebaseGraph;

    useGraphStore.getState().setGraph(mockGraph);
    render(<ArchitectureCanvas />);

    // Initial editor click centers camera
    act(() => {
      useGraphStore.getState().navigateToTarget({
        fileId: "file:src/app.ts",
        source: "editor",
        timestamp: Date.now(),
      });
    });
    expect(mockSetCenter).toHaveBeenCalledTimes(1);

    // Zoom out event clears lastCenteredTargetKeyRef
    act(() => {
      capturedViewportChangeHandler!({ x: 0, y: 0, zoom: 0.5 });
    });

    // Clicking editor again re-centers camera even for the same target
    act(() => {
      useGraphStore.getState().navigateToTarget({
        fileId: "file:src/app.ts",
        source: "editor",
        timestamp: Date.now() + 500,
      });
    });
    expect(mockSetCenter).toHaveBeenCalledTimes(2);
  });

  it("renders layout calculating indicator in toolbar during background calculation (AC-4)", () => {
    class MockWorker {
      public onmessage:
        ((event: MessageEvent<LayoutWorkerResponse>) => void) | null = null;
      public postMessage(): void {}
      public terminate(): void {}
    }

    (globalThis as unknown as Record<string, unknown>).Worker = MockWorker;

    const mockGraph = {
      schemaVersion: 1,
      repository: {
        id: "repo:org/app",
        owner: "org",
        name: "app",
        fullName: "org/app",
        defaultBranch: "main",
        commitSha: "sha1",
        analyzedAt: new Date().toISOString(),
        totalFiles: 1,
        totalSymbols: 0,
        languages: { typescript: 1 },
        schemaVersion: 1,
      },
      directories: {},
      files: {
        "file:src/main.ts": {
          id: "file:src/main.ts",
          path: "src/main.ts",
          name: "main.ts",
          extension: ".ts",
          language: "typescript",
          sizeBytes: 200,
          lineCount: 15,
          directoryId: "dir:src",
          symbolIds: [],
          importIds: [],
          exportIds: [],
        },
      },
      symbols: {},
      externalModules: {},
      edges: {},
    } as unknown as CodebaseGraph;

    useGraphStore.getState().setGraph(mockGraph);
    render(<ArchitectureCanvas />);

    // In worker supported environments, layout calculation starts on mount and indicator appears
    expect(
      screen.getByTestId("layout-calculating-indicator"),
    ).toBeInTheDocument();
  });

  it("renders layout error alert banner while retaining visible canvas elements on failure (AC-4, AC-6)", async () => {
    vi.useFakeTimers();

    let postedMessage: LayoutWorkerRequest | null = null;
    let workerOnMessage:
      ((event: MessageEvent<LayoutWorkerResponse>) => void) | null = null;

    class MockWorker {
      public set onmessage(
        fn: (event: MessageEvent<LayoutWorkerResponse>) => void,
      ) {
        workerOnMessage = fn;
      }
      public postMessage(msg: LayoutWorkerRequest): void {
        postedMessage = msg;
      }
      public terminate(): void {}
    }

    (globalThis as unknown as Record<string, unknown>).Worker = MockWorker;

    const mockGraph = {
      schemaVersion: 1,
      repository: {
        id: "repo:org/app",
        owner: "org",
        name: "app",
        fullName: "org/app",
        defaultBranch: "main",
        commitSha: "sha1",
        analyzedAt: new Date().toISOString(),
        totalFiles: 1,
        totalSymbols: 0,
        languages: { typescript: 1 },
        schemaVersion: 1,
      },
      directories: {},
      files: {
        "file:src/main.ts": {
          id: "file:src/main.ts",
          path: "src/main.ts",
          name: "main.ts",
          extension: ".ts",
          language: "typescript",
          sizeBytes: 200,
          lineCount: 15,
          directoryId: "dir:src",
          symbolIds: [],
          importIds: [],
          exportIds: [],
        },
      },
      symbols: {},
      externalModules: {},
      edges: {},
    } as unknown as CodebaseGraph;

    useGraphStore.getState().setGraph(mockGraph);
    render(<ArchitectureCanvas />);

    expect(screen.getByTestId("architecture-canvas")).toBeInTheDocument();
    expect(screen.queryByTestId("canvas-layout-error")).not.toBeInTheDocument();

    // Trigger filter update
    act(() => {
      useGraphStore.getState().setSearchQuery("trigger-worker");
    });

    // Advance through debounce window
    await act(async () => {
      vi.advanceTimersByTime(60);
    });

    expect(postedMessage).not.toBeNull();
    const requestId = (postedMessage as unknown as LayoutWorkerRequest).id;

    // Simulate worker returning layout error response
    await act(async () => {
      workerOnMessage?.({
        data: createWorkerErrorResponse(
          requestId,
          "TIMEOUT",
          "Layout calculation timed out after 5000ms",
        ),
      } as unknown as MessageEvent<LayoutWorkerResponse>);
    });

    // Error banner is rendered with accessible role and message
    const errorBanner = screen.getByTestId("canvas-layout-error");
    expect(errorBanner).toBeInTheDocument();
    expect(errorBanner).toHaveAttribute("role", "alert");
    expect(errorBanner.textContent).toContain(
      "Background layout calculation failed",
    );
    expect(errorBanner.textContent).toContain("Showing previous layout");

    // Canvas container remains present and interactive
    expect(screen.getByTestId("architecture-canvas")).toBeInTheDocument();

    vi.useRealTimers();
  });
});
