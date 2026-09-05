import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ArchitectureCanvas } from "../architecture-canvas";
import { useGraphStore } from "@/stores/graph-store";
import type { CodebaseGraph } from "@/entities";

const mockSetCenter = vi.fn();
const mockFitView = vi.fn();
const mockZoomIn = vi.fn();
const mockZoomOut = vi.fn();

vi.mock("@xyflow/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@xyflow/react")>();
  return {
    ...actual,
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
});
