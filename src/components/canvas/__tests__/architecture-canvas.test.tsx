import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ArchitectureCanvas } from "../architecture-canvas";
import { useGraphStore } from "@/stores/graph-store";
import type { CodebaseGraph } from "@/entities";

const mockSetCenter = vi.fn();
const mockFitView = vi.fn();

vi.mock("@xyflow/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@xyflow/react")>();
  return {
    ...actual,
    useReactFlow: () => ({
      fitView: mockFitView,
      zoomIn: vi.fn(),
      zoomOut: vi.fn(),
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
});
