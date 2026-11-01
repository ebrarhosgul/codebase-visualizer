import React from "react";
import { render, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ArchitectureCanvas } from "../architecture-canvas";
import { useGraphStore } from "@/stores/graph-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import {
  CURRENT_SCHEMA_VERSION,
  createGraphEdge,
  type CodebaseGraph,
  type FileNode,
  type DirectoryNode,
} from "@/entities";
import { layoutWorkerClient } from "@/graph/layout/layout-worker-client";
import type { ReactFlowProps } from "@xyflow/react";

const mockSetCenter = vi.fn();
const mockFitView = vi.fn();

let capturedReactFlowProps: ReactFlowProps | null = null;

vi.mock("@xyflow/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@xyflow/react")>();
  return {
    ...actual,
    ReactFlow: (props: ReactFlowProps) => {
      capturedReactFlowProps = props;
      return <div data-testid="mock-react-flow" />;
    },
    useReactFlow: () => ({
      fitView: mockFitView,
      zoomIn: vi.fn(),
      zoomOut: vi.fn(),
      getZoom: () => 1.0,
      setCenter: mockSetCenter,
    }),
  };
});

function createMockFile(
  id: string,
  path: string,
  directoryId = "dir:1",
): FileNode {
  return {
    id,
    path,
    name: path.split("/").pop() ?? path,
    extension: ".ts",
    language: "typescript",
    sizeBytes: 100,
    lineCount: 20,
    directoryId,
    symbolIds: [],
    importIds: [],
    exportIds: [],
  };
}

function createMockDirectory(
  id: string,
  path: string,
  parentDirId: string | null = null,
  childFileIds: string[] = [],
  childDirIds: string[] = [],
): DirectoryNode {
  return {
    id,
    path,
    name: path.split("/").pop() ?? path,
    parentDirId,
    childFileIds,
    childDirIds,
  };
}

function createMockGraph(): CodebaseGraph {
  const edge1 = createGraphEdge({
    sourceId: "file-1",
    targetId: "file-2",
    kind: "file_import",
  });

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    repository: {
      id: "repo:facebook/react",
      owner: "facebook",
      name: "react",
      fullName: "facebook/react",
      defaultBranch: "main",
      commitSha: "123456",
      analyzedAt: new Date().toISOString(),
      totalFiles: 2,
      totalSymbols: 0,
      languages: { TypeScript: 100 },
      schemaVersion: CURRENT_SCHEMA_VERSION,
    },
    files: {
      "file-1": createMockFile("file-1", "src/index.ts", "dir:1"),
      "file-2": createMockFile(
        "file-2",
        "src/collapsed/child.ts",
        "dir:collapsed",
      ),
    },
    directories: {
      "dir:1": createMockDirectory(
        "dir:1",
        "src",
        null,
        ["file-1"],
        ["dir:collapsed"],
      ),
      "dir:collapsed": createMockDirectory(
        "dir:collapsed",
        "src/collapsed",
        "dir:1",
        ["file-2"],
        [],
      ),
    },
    symbols: {},
    externalModules: {},
    edges: {
      [edge1.id]: edge1,
    },
  };
}

describe("ArchitectureCanvas video sync (AC-8, AC-9, AC-10)", () => {
  beforeEach(() => {
    layoutWorkerClient.terminate();
    useGraphStore.getState().reset();
    useWorkspaceStore.getState().resetLayout();
    mockSetCenter.mockClear();
    mockFitView.mockClear();
    capturedReactFlowProps = null;
  });

  afterEach(() => {
    layoutWorkerClient.terminate();
  });

  it("sets isVideoAutoPanEnabled to false on user manual drag during video sync (AC-9)", async () => {
    const graph = createMockGraph();
    useGraphStore.getState().setGraph(graph);

    useGraphStore.setState({
      highlightSource: "video",
      isVideoAutoPanEnabled: true,
      videoFocalNodeId: "file-1",
    });

    render(<ArchitectureCanvas />);

    expect(capturedReactFlowProps).not.toBeNull();
    const handleMoveStart = capturedReactFlowProps?.onMoveStart;
    expect(handleMoveStart).toBeDefined();

    // Trigger user manual drag with a non null MouseEvent
    act(() => {
      handleMoveStart?.(new MouseEvent("mousedown"), { x: 0, y: 0, zoom: 1 });
    });

    expect(useGraphStore.getState().isVideoAutoPanEnabled).toBe(false);
  });

  it("does not pause auto pan if move was programmatic (null event)", async () => {
    const graph = createMockGraph();
    useGraphStore.getState().setGraph(graph);

    useGraphStore.setState({
      highlightSource: "video",
      isVideoAutoPanEnabled: true,
      videoFocalNodeId: "file-1",
    });

    render(<ArchitectureCanvas />);

    const handleMoveStart = capturedReactFlowProps?.onMoveStart;
    act(() => {
      handleMoveStart?.(null, { x: 0, y: 0, zoom: 1 });
    });

    expect(useGraphStore.getState().isVideoAutoPanEnabled).toBe(true);
  });
});
