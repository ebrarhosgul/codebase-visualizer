import { render, screen, act, fireEvent, within } from "@testing-library/react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import Home from "./page";
import { useGraphStore } from "@/stores/graph-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { CodebaseGraph } from "@/entities";

const mockReplace = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
  useSearchParams: () => mockSearchParams,
}));

describe("Home Page", () => {
  beforeEach(() => {
    useGraphStore.getState().reset();
    useWorkspaceStore.getState().resetLayout();
    mockSearchParams = new URLSearchParams();
    mockReplace.mockClear();
    vi.restoreAllMocks();
  });

  it("renders page header, repository input, canvas, and inspector tabs", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Codebase Visualizer" }),
    ).toBeInTheDocument();

    expect(
      screen.getByLabelText("Public GitHub Repository URL"),
    ).toBeInTheDocument();

    expect(
      screen.getByLabelText("Filter repository files"),
    ).toBeInTheDocument();

    expect(screen.getByRole("tab", { name: /Code/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Inspector/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Trace/i })).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: "Analyze Repository" }),
    ).toBeInTheDocument();
  });

  it("navigates to code viewer when clicking a file item in the explorer (AC-1, AC-2)", () => {
    const mockGraph = {
      schemaVersion: 1,
      repository: {
        id: "repo:test/repo",
        owner: "test",
        name: "repo",
        fullName: "test/repo",
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
        "file:src/index.ts": {
          id: "file:src/index.ts",
          path: "src/index.ts",
          name: "index.ts",
          extension: ".ts",
          language: "typescript",
          sizeBytes: 1024,
          lineCount: 30,
          directoryId: "dir:src",
          symbolIds: [],
          importIds: [],
          exportIds: [],
        },
        "file:src/utils.ts": {
          id: "file:src/utils.ts",
          path: "src/utils.ts",
          name: "utils.ts",
          extension: ".ts",
          language: "typescript",
          sizeBytes: 512,
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

    useGraphStore
      .getState()
      .setGraph(mockGraph, { "file:src/index.ts": "const x = 1;" });

    render(<Home />);

    const fileItem = screen.getByRole("button", { name: "File src/index.ts" });
    expect(fileItem).toBeInTheDocument();

    act(() => {
      fireEvent.click(fileItem);
    });

    expect(useGraphStore.getState().selectedFileId).toBe("file:src/index.ts");
    expect(useGraphStore.getState().activeTarget?.fileId).toBe(
      "file:src/index.ts",
    );
    expect(useGraphStore.getState().activeTarget?.source).toBe("canvas");
    expect(useWorkspaceStore.getState().activeRightTab).toBe("code");
    expect(useWorkspaceStore.getState().isRightPanelCollapsed).toBe(false);
  });

  it("supports keyboard navigation on file items via Enter and Space keys (AC-2, a11y)", () => {
    const mockGraph = {
      schemaVersion: 1,
      repository: {
        id: "repo:test/repo",
        owner: "test",
        name: "repo",
        fullName: "test/repo",
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
          sizeBytes: 1024,
          lineCount: 30,
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
    render(<Home />);

    const fileItem = screen.getByRole("button", { name: "File src/index.ts" });

    // Press Space key
    act(() => {
      fireEvent.keyDown(fileItem, { key: " " });
    });
    expect(useGraphStore.getState().selectedFileId).toBe("file:src/index.ts");

    // Clear selection
    act(() => {
      useGraphStore.getState().selectNode(null);
    });
    expect(useGraphStore.getState().selectedFileId).toBeNull();

    // Press Enter key
    act(() => {
      fireEvent.keyDown(fileItem, { key: "Enter" });
    });
    expect(useGraphStore.getState().selectedFileId).toBe("file:src/index.ts");
  });

  it("filters repository files list based on search input", () => {
    const mockGraph = {
      schemaVersion: 1,
      repository: {
        id: "repo:test/repo",
        owner: "test",
        name: "repo",
        fullName: "test/repo",
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
        "file:src/components/button.tsx": {
          id: "file:src/components/button.tsx",
          path: "src/components/button.tsx",
          name: "button.tsx",
          extension: ".tsx",
          language: "typescript",
          sizeBytes: 800,
          lineCount: 25,
          directoryId: "dir:src/components",
          symbolIds: [],
          importIds: [],
          exportIds: [],
        },
        "file:src/utils/math.ts": {
          id: "file:src/utils/math.ts",
          path: "src/utils/math.ts",
          name: "math.ts",
          extension: ".ts",
          language: "typescript",
          sizeBytes: 400,
          lineCount: 15,
          directoryId: "dir:src/utils",
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
    render(<Home />);

    expect(
      screen.getByRole("button", { name: "File src/components/button.tsx" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "File src/utils/math.ts" }),
    ).toBeInTheDocument();

    const filterInput = screen.getByLabelText("Filter repository files");
    act(() => {
      fireEvent.change(filterInput, { target: { value: "math" } });
    });

    expect(
      screen.queryByRole("button", { name: "File src/components/button.tsx" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "File src/utils/math.ts" }),
    ).toBeInTheDocument();

    // When filter matches nothing
    act(() => {
      fireEvent.change(filterInput, { target: { value: "nonexistent" } });
    });
    expect(screen.getByText("No files matching filter.")).toBeInTheDocument();
  });

  it("renders toast warning when deep link fallback occurs (AC-6)", () => {
    render(<Home />);

    act(() => {
      useGraphStore.setState({
        fallbackNotification:
          'File "missing.ts" was not found in the parsed repository.',
      });
    });

    expect(
      screen.getByText(
        'File "missing.ts" was not found in the parsed repository.',
      ),
    ).toBeInTheDocument();

    // Close toast via dismiss button
    const closeBtn = screen.getByRole("button", {
      name: "Dismiss notification",
    });
    act(() => {
      fireEvent.click(closeBtn);
    });

    expect(
      screen.queryByText(
        'File "missing.ts" was not found in the parsed repository.',
      ),
    ).not.toBeInTheDocument();
  });

  it("displays file details in Inspector tab when a file is selected", () => {
    const mockGraph = {
      schemaVersion: 1,
      repository: {
        id: "repo:test/repo",
        owner: "test",
        name: "repo",
        fullName: "test/repo",
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
          sizeBytes: 2048,
          lineCount: 45,
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
    useGraphStore.getState().selectNode("file:src/index.ts");

    render(<Home />);

    // Click the Inspector tab (Radix Tabs activates on mouseDown with button 0)
    const inspectorTab = screen.getByRole("tab", { name: /Inspector/i });
    act(() => {
      fireEvent.mouseDown(inspectorTab, { button: 0 });
    });

    const panel = screen.getByTestId("node-inspector-panel");
    expect(panel).toBeInTheDocument();
    expect(within(panel).getByText("index.ts")).toBeInTheDocument();
    expect(within(panel).getByText("src/index.ts")).toBeInTheDocument();
    expect(within(panel).getByText("45")).toBeInTheDocument();
  });

  it("renders layer filter bar controls on the page when repository graph is loaded (AC-2)", () => {
    const mockGraph = {
      schemaVersion: 1,
      repository: {
        id: "repo:test/repo",
        owner: "test",
        name: "repo",
        fullName: "test/repo",
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
        "file:src/components/badge.tsx": {
          id: "file:src/components/badge.tsx",
          path: "src/components/badge.tsx",
          name: "badge.tsx",
          extension: ".tsx",
          language: "typescript",
          sizeBytes: 300,
          lineCount: 12,
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
    render(<Home />);

    expect(screen.getByTestId("layer-filter-bar")).toBeInTheDocument();
    expect(screen.getByTestId("layer-filter-components")).toBeInTheDocument();
  });
});
