import { render, screen, act, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { CodeViewer } from "../code-viewer";
import { useGraphStore } from "@/stores/graph-store";
import type { CodebaseGraph } from "@/entities";

const mockRevealLineInCenter = vi.fn();
const mockSetPosition = vi.fn();
const mockClearDecorations = vi.fn();
const mockCreateDecorationsCollection = vi.fn().mockReturnValue({
  clear: mockClearDecorations,
});
interface CursorPositionEvent {
  position: {
    lineNumber: number;
    column: number;
  };
}

interface MockEditor {
  revealLineInCenter: (line: number, scrollType: number) => void;
  setPosition: (pos: { lineNumber: number; column: number }) => void;
  createDecorationsCollection: (decorations: unknown[]) => {
    clear: () => void;
  };
  onDidChangeCursorPosition: (cb: (e: CursorPositionEvent) => void) => {
    dispose: () => void;
  };
  getModel?: () => { getLineCount: () => number } | null;
}

interface MockMonaco {
  editor: {
    ScrollType: { Smooth: number };
    OverviewRulerLane: { Full: number };
  };
  Range: new (
    startLineNumber: number,
    startColumn: number,
    endLineNumber: number,
    endColumn: number,
  ) => {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  };
}

let cursorPositionCallback: ((e: CursorPositionEvent) => void) | null = null;

// Mock Monaco Editor for test environment
vi.mock("@monaco-editor/react", () => ({
  default: ({
    value,
    onMount,
  }: {
    value: string;
    onMount?: (editor: MockEditor, monaco: MockMonaco) => void;
  }) => {
    // Call onMount synchronously or in effect
    if (onMount) {
      const mockEditor: MockEditor = {
        revealLineInCenter: mockRevealLineInCenter,
        setPosition: mockSetPosition,
        createDecorationsCollection: mockCreateDecorationsCollection,
        onDidChangeCursorPosition: (cb: (e: CursorPositionEvent) => void) => {
          cursorPositionCallback = cb;
          return { dispose: vi.fn() };
        },
        getModel: () => ({ getLineCount: () => 100 }),
      };
      const mockMonaco: MockMonaco = {
        editor: {
          ScrollType: { Smooth: 1 },
          OverviewRulerLane: { Full: 7 },
        },
        Range: class {
          constructor(
            public startLineNumber: number,
            public startColumn: number,
            public endLineNumber: number,
            public endColumn: number,
          ) {}
        },
      };
      onMount(mockEditor, mockMonaco);
    }
    return <div data-testid="mock-monaco-editor">{value}</div>;
  },
}));

describe("CodeViewer", () => {
  beforeEach(() => {
    useGraphStore.getState().reset();
    mockRevealLineInCenter.mockClear();
    mockSetPosition.mockClear();
    mockCreateDecorationsCollection.mockClear();
    mockClearDecorations.mockClear();
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

  it("scrolls Monaco smoothly and applies pulse highlight when activeTarget changes (AC-2)", () => {
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

    useGraphStore.getState().setGraph(mockGraph, {
      "file:src/index.ts": "line1\nline2\nline3\nline4\nline5",
    });

    useGraphStore.getState().selectNode("file:src/index.ts");
    render(<CodeViewer />);

    act(() => {
      useGraphStore.getState().navigateToTarget({
        fileId: "file:src/index.ts",
        line: 12,
        column: 4,
        source: "canvas",
        timestamp: Date.now(),
      });
    });

    expect(mockRevealLineInCenter).toHaveBeenCalledWith(12, 1);
    expect(mockSetPosition).toHaveBeenCalledWith({ lineNumber: 12, column: 4 });
    expect(mockCreateDecorationsCollection).toHaveBeenCalled();
  });

  it("identifies innermost symbol and triggers reverse navigation on cursor movement (AC-3)", () => {
    vi.useFakeTimers();

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
        totalSymbols: 2,
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
          sizeBytes: 256,
          lineCount: 30,
          directoryId: "dir:src",
          symbolIds: ["symbol:src/index.ts#outer", "symbol:src/index.ts#inner"],
          importIds: [],
          exportIds: [],
        },
      },
      symbols: {
        "symbol:src/index.ts#outer": {
          id: "symbol:src/index.ts#outer",
          fileId: "file:src/index.ts",
          parentSymbolId: null,
          name: "outer",
          kind: "class",
          range: {
            startLine: 5,
            startColumn: 1,
            endLine: 25,
            endColumn: 1,
            startOffset: 50,
            endOffset: 250,
          },
          selectionRange: {
            startLine: 5,
            startColumn: 7,
            endLine: 5,
            endColumn: 12,
            startOffset: 56,
            endOffset: 61,
          },
          isExported: true,
          isDefaultExport: false,
          signature: "class outer",
          documentation: null,
          visibility: "public",
          childSymbolIds: ["symbol:src/index.ts#inner"],
        },
        "symbol:src/index.ts#inner": {
          id: "symbol:src/index.ts#inner",
          fileId: "file:src/index.ts",
          parentSymbolId: "symbol:src/index.ts#outer",
          name: "inner",
          kind: "method",
          range: {
            startLine: 10,
            startColumn: 3,
            endLine: 15,
            endColumn: 3,
            startOffset: 100,
            endOffset: 150,
          },
          selectionRange: {
            startLine: 10,
            startColumn: 10,
            endLine: 10,
            endColumn: 15,
            startOffset: 107,
            endOffset: 112,
          },
          isExported: true,
          isDefaultExport: false,
          signature: "inner()",
          documentation: null,
          visibility: "public",
          childSymbolIds: [],
        },
      },
      externalModules: {},
      edges: {},
    } as unknown as CodebaseGraph;

    useGraphStore
      .getState()
      .setGraph(mockGraph, { "file:src/index.ts": "sample code content" });

    useGraphStore.getState().selectNode("file:src/index.ts");
    render(<CodeViewer />);

    expect(cursorPositionCallback).toBeDefined();

    // Advance past selectNode's 300ms time lock
    act(() => {
      vi.advanceTimersByTime(400);
    });

    // Move cursor to line 12 (inside both outer and inner; inner is smaller span)
    act(() => {
      cursorPositionCallback?.({
        position: { lineNumber: 12, column: 5 },
      });
      // Fast forward past the 150ms debounce
      vi.advanceTimersByTime(200);
    });

    const activeTarget = useGraphStore.getState().activeTarget;
    expect(activeTarget?.fileId).toBe("file:src/index.ts");
    expect(activeTarget?.symbolId).toBe("symbol:src/index.ts#inner");
    expect(activeTarget?.line).toBe(12);
    expect(activeTarget?.source).toBe("editor");

    // Moving cursor in editor should NOT trigger revealLineInCenter or pulse decorations
    expect(mockRevealLineInCenter).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("clamps out-of-bounds line numbers to model line count (AC-2)", () => {
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

    useGraphStore
      .getState()
      .setGraph(mockGraph, { "file:src/index.ts": "line1\nline2" });
    useGraphStore.getState().selectNode("file:src/index.ts");
    render(<CodeViewer />);

    act(() => {
      useGraphStore.getState().navigateToTarget({
        fileId: "file:src/index.ts",
        line: 9999, // Way past line count (mock getLineCount is 100)
        column: 1,
        source: "canvas",
        timestamp: Date.now(),
      });
    });

    // Clamped to max line 100
    expect(mockRevealLineInCenter).toHaveBeenCalledWith(100, 1);
    expect(mockSetPosition).toHaveBeenCalledWith({
      lineNumber: 100,
      column: 1,
    });
  });

  it("copies deep link to clipboard when Share button is clicked (AC-8)", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

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
      .setGraph(mockGraph, { "file:src/index.ts": "const x = 1;" });

    useGraphStore.getState().selectNode("file:src/index.ts");

    render(<CodeViewer />);

    const shareBtn = screen.getByRole("button", {
      name: /copy deep link permalink/i,
    });
    expect(shareBtn).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(shareBtn);
    });

    expect(writeTextMock).toHaveBeenCalled();
  });
});
