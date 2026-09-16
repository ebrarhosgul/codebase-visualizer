import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ArchitectureCanvas } from "../architecture-canvas";
import { useGraphStore } from "@/stores/graph-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { CodebaseGraph } from "@/entities";

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
  beforeEach(() => {
    useGraphStore.getState().reset();
    useWorkspaceStore.getState().resetLayout();
    capturedReactFlowProps = null;
    capturedViewportChangeHandler = null;
    mockSetCenter.mockClear();
    mockFitView.mockClear();
    mockZoomIn.mockClear();
    mockZoomOut.mockClear();
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
    expect(idleMarker?.color).toBe("#64748b");
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
    expect(outgoingEdge?.style?.opacity).toBe(1);
    expect(outgoingEdge?.style?.filter).toContain("drop-shadow");
    const outgoingMarker = outgoingEdge?.markerEnd as
      { color?: string } | undefined;
    expect(outgoingMarker?.color).toBe("#38bdf8");
    expect(outgoingMarker?.color).not.toContain("var(");

    expect(dimmedEdge).toBeDefined();
    expect(dimmedEdge?.animated).toBe(false);
    expect(dimmedEdge?.style?.stroke).toBe("#1e293b");
    expect(dimmedEdge?.style?.opacity).toBe(0.2);
    const dimmedMarker = dimmedEdge?.markerEnd as
      { color?: string } | undefined;
    expect(dimmedMarker?.color).toBe("#334155");

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
    expect(incomingEdge?.style?.opacity).toBe(1);
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
    // The connecting arrow must stay active and clearly visible, not dimmed to 0.2 opacity
    expect(outgoingEdgeFromEditor).toBeDefined();
    expect(outgoingEdgeFromEditor?.animated).toBe(true);
    expect(outgoingEdgeFromEditor?.style?.stroke).toBe("#38bdf8");
    expect(outgoingEdgeFromEditor?.style?.strokeWidth).toBe(3);
    expect(outgoingEdgeFromEditor?.style?.opacity).toBe(1);
    const editorMarker = outgoingEdgeFromEditor?.markerEnd as
      { color?: string } | undefined;
    expect(editorMarker?.color).toBe("#38bdf8");
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
});
