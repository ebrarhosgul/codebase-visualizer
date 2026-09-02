import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { CodeViewer } from "../code-viewer";
import { useGraphStore } from "@/stores/graph-store";
import type { CodebaseGraph } from "@/entities";

// Mock Monaco Editor for test environment
vi.mock("@monaco-editor/react", () => ({
  default: ({ value }: { value: string }) => (
    <div data-testid="mock-monaco-editor">{value}</div>
  ),
}));

describe("CodeViewer", () => {
  beforeEach(() => {
    useGraphStore.getState().reset();
  });

  it("renders empty state placeholder when no file is selected", () => {
    render(<CodeViewer />);
    expect(screen.getByTestId("code-viewer-empty")).toBeInTheDocument();
    expect(screen.getByText("No File Selected")).toBeInTheDocument();
  });

  it("renders file header, line count, and source code when a file is selected (AC-7)", () => {
    const mockGraph = {
      schemaVersion: 1,
      repository: {
        id: "repo:test/repo",
        owner: "test",
        name: "repo",
        fullName: "test/repo",
        defaultBranch: "main",
        commitSha: "s1",
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
          sizeBytes: 128,
          lineCount: 8,
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

    useGraphStore
      .getState()
      .setGraph(mockGraph, { "file:src/index.ts": "const answer = 42;" });

    useGraphStore.getState().selectNode("file:src/index.ts");

    render(<CodeViewer />);

    expect(screen.getByTestId("code-viewer")).toBeInTheDocument();
    expect(screen.getByText("src/index.ts")).toBeInTheDocument();
    expect(screen.getByText("8 lines")).toBeInTheDocument();
    expect(screen.getByText("const answer = 42;")).toBeInTheDocument();
  });

  it("displays syntax warning banner when file has parseError (AC-4)", () => {
    const mockGraph = {
      schemaVersion: 1,
      repository: {
        id: "repo:test/repo",
        owner: "test",
        name: "repo",
        fullName: "test/repo",
        defaultBranch: "main",
        commitSha: "s1",
        analyzedAt: new Date().toISOString(),
        totalFiles: 1,
        totalSymbols: 0,
        languages: { typescript: 1 },
        schemaVersion: 1,
      },
      directories: {},
      files: {
        "file:src/broken.ts": {
          id: "file:src/broken.ts",
          path: "src/broken.ts",
          name: "broken.ts",
          extension: ".ts",
          language: "typescript",
          sizeBytes: 64,
          lineCount: 3,
          directoryId: "dir:src",
          symbolIds: [],
          importIds: [],
          exportIds: [],
          parseError: "Unexpected token semicolon",
        },
      },
      symbols: {},
      externalModules: {},
      edges: {},
    } as unknown as CodebaseGraph;

    useGraphStore
      .getState()
      .setGraph(mockGraph, { "file:src/broken.ts": "const x = ;" });

    useGraphStore.getState().selectNode("file:src/broken.ts");

    render(<CodeViewer />);

    expect(
      screen.getByText(/Syntax Warning: Unexpected token semicolon/i),
    ).toBeInTheDocument();
  });
});
