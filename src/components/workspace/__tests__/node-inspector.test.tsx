import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NodeInspector } from "../node-inspector";
import { useGraphStore } from "@/stores/graph-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type {
  CodebaseGraph,
  FileNode,
  SymbolNode,
  GraphEdge,
  DirectoryNode,
} from "@/entities";

describe("NodeInspector Component", () => {
  const mockGraph: CodebaseGraph = {
    schemaVersion: 1,
    repository: {
      id: "repo:test/repo",
      owner: "test",
      name: "repo",
      fullName: "test/repo",
      defaultBranch: "main",
      commitSha: "sha1",
      analyzedAt: "2026-09-05T00:00:00Z",
      totalFiles: 2,
      totalSymbols: 2,
      languages: { typescript: 100 },
      schemaVersion: 1,
    },
    directories: {
      "dir:src/components": {
        id: "dir:src/components",
        path: "src/components",
        name: "components",
        parentDirId: null,
        childDirIds: [],
        childFileIds: ["file:src/components/button.tsx"],
      } as DirectoryNode,
    },
    files: {
      "file:src/components/button.tsx": {
        id: "file:src/components/button.tsx",
        path: "src/components/button.tsx",
        name: "button.tsx",
        extension: ".tsx",
        language: "typescript",
        sizeBytes: 1200,
        lineCount: 45,
        directoryId: "dir:src/components",
        symbolIds: ["symbol:button", "symbol:internalHelper"],
        importIds: [],
        exportIds: [],
      } as unknown as FileNode,
      "file:src/app/page.tsx": {
        id: "file:src/app/page.tsx",
        path: "src/app/page.tsx",
        name: "page.tsx",
        extension: ".tsx",
        language: "typescript",
        sizeBytes: 2500,
        lineCount: 80,
        directoryId: "dir:src/app",
        symbolIds: [],
        importIds: [],
        exportIds: [],
      } as unknown as FileNode,
    },
    symbols: {
      "symbol:button": {
        id: "symbol:button",
        name: "Button",
        kind: "function",
        fileId: "file:src/components/button.tsx",
        range: { startLine: 10, endLine: 35, startColumn: 1, endColumn: 2 },
        isExported: true,
      } as unknown as SymbolNode,
      "symbol:internalHelper": {
        id: "symbol:internalHelper",
        name: "formatClass",
        kind: "function",
        fileId: "file:src/components/button.tsx",
        range: { startLine: 38, endLine: 44, startColumn: 1, endColumn: 2 },
        isExported: false,
      } as unknown as SymbolNode,
    },
    externalModules: {},
    edges: {
      "edge:1": {
        id: "edge:1",
        sourceId: "file:src/app/page.tsx",
        targetId: "file:src/components/button.tsx",
        kind: "file_import",
        weight: 1,
        isExternal: false,
      } as GraphEdge,
    },
  };

  beforeEach(() => {
    useGraphStore.getState().reset();
    useWorkspaceStore.setState({ activeRightTab: "inspector" });
    useGraphStore.getState().setGraph(mockGraph);
  });

  it("renders empty state when no node is selected (AC-7)", () => {
    render(<NodeInspector />);
    expect(screen.getByTestId("node-inspector-empty")).toBeInTheDocument();
    expect(screen.getByText("No Node Selected")).toBeInTheDocument();
  });

  it("renders file structural details, metrics, and symbols (AC-7)", () => {
    useGraphStore.getState().selectNode("file:src/components/button.tsx");
    render(<NodeInspector />);

    expect(screen.getByText("button.tsx")).toBeInTheDocument();
    expect(screen.getByText("src/components/button.tsx")).toBeInTheDocument();
    expect(screen.getByText("Components")).toBeInTheDocument();
    expect(screen.getByText("45")).toBeInTheDocument(); // lines
    expect(screen.getByText("Button")).toBeInTheDocument();
    expect(screen.getByText("formatClass")).toBeInTheDocument();
  });

  it("triggers dual-action navigation when dependency chip is clicked (AC-8)", () => {
    useGraphStore.getState().selectNode("file:src/components/button.tsx");
    render(<NodeInspector />);

    // Click incoming caller chip
    const depChip = screen.getByTestId("incoming-dep-0");
    fireEvent.click(depChip);

    // Target should be navigated to with source 'search' and right tab set to 'code'
    expect(useGraphStore.getState().activeTarget?.fileId).toBe(
      "file:src/app/page.tsx",
    );
    expect(useWorkspaceStore.getState().activeRightTab).toBe("code");
  });

  it("displays hidden node warning and reveals node when filtered out (AC-9)", () => {
    useGraphStore.getState().selectNode("file:src/components/button.tsx");

    // Apply a layer filter that excludes components
    useGraphStore.getState().setLayerFilters(["utils"]);

    render(<NodeInspector />);

    expect(screen.getByTestId("node-hidden-warning")).toBeInTheDocument();
    expect(screen.getByText("Filtered from canvas")).toBeInTheDocument();

    const revealBtn = screen.getByTestId("inspector-reveal-node-btn");
    fireEvent.click(revealBtn);

    // Layers should now include components
    expect(useGraphStore.getState().selectedLayers).toContain("components");
  });

  it("renders directory details with constituent files (AC-7)", () => {
    useGraphStore.getState().selectNode("folder-group:src/components");
    render(<NodeInspector />);

    expect(screen.getAllByText("src/components").length).toBeGreaterThan(0);
    expect(screen.getByText("Contained Files (1)")).toBeInTheDocument();
    expect(
      screen.getByTestId("constituent-file-file:src/components/button.tsx"),
    ).toBeInTheDocument();
  });
});
