import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { useDeepLinking } from "../use-deep-linking";
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

describe("useDeepLinking", () => {
  beforeEach(() => {
    useGraphStore.getState().reset();
    useWorkspaceStore.getState().resetLayout();
    mockSearchParams = new URLSearchParams();
    mockReplace.mockClear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("buffers deep link parameters on mount (AC-1, AC-7)", () => {
    vi.spyOn(useGraphStore.getState(), "startIngestion").mockResolvedValue(
      undefined,
    );
    mockSearchParams = new URLSearchParams(
      "repo=facebook/react&file=packages/react/src/React.js&line=25&symbol=useState",
    );

    act(() => {
      renderHook(() => useDeepLinking());
    });

    const pending = useGraphStore.getState().pendingTarget;
    expect(pending).toBeDefined();
    expect(pending?.fileId).toBe("file:packages/react/src/React.js");
    expect(pending?.line).toBe(25);
    expect(pending?.symbolId).toBe(
      "symbol:packages/react/src/React.js#useState",
    );
  });

  it("triggers startIngestion when repo parameter is present on cold start", () => {
    mockSearchParams = new URLSearchParams("repo=facebook/react");
    const startIngestionSpy = vi
      .spyOn(useGraphStore.getState(), "startIngestion")
      .mockResolvedValue(undefined);

    act(() => {
      renderHook(() => useDeepLinking());
    });

    expect(startIngestionSpy).toHaveBeenCalledWith({
      repositoryUrl: "https://github.com/facebook/react",
      branch: undefined,
    });
  });

  it("rejects invalid characters in query params and calls fallback handler (AC-6)", () => {
    mockSearchParams = new URLSearchParams(
      "file=<script>alert(1)</script>&line=10",
    );
    const fallbackMock = vi.fn();

    act(() => {
      renderHook(() => useDeepLinking(fallbackMock));
    });

    expect(fallbackMock).toHaveBeenCalledWith(
      expect.stringContaining("Invalid deep link"),
    );
    expect(useGraphStore.getState().pendingTarget).toBeNull();
  });

  it("synchronizes active target changes to browser address bar (AC-1)", () => {
    const replaceStateSpy = vi.spyOn(window.history, "replaceState");

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

    const { rerender } = renderHook(() => useDeepLinking());

    // Trigger editor cursor navigation
    act(() => {
      useGraphStore.getState().navigateToTarget({
        fileId: "file:src/index.ts",
        line: 8,
        source: "editor",
        timestamp: Date.now(),
      });
    });

    rerender();

    expect(replaceStateSpy).toHaveBeenCalledWith(
      null,
      "",
      expect.stringContaining("file=src%2Findex.ts&line=8"),
    );
  });

  it("handles fallbackNotification by invoking onFallback and cleaning URL parameters (AC-6)", () => {
    const fallbackMock = vi.fn();
    const replaceStateSpy = vi.spyOn(window.history, "replaceState");

    const { rerender } = renderHook(() => useDeepLinking(fallbackMock));

    // Simulate store triggering fallbackNotification for a missing file
    act(() => {
      useGraphStore.setState({
        fallbackNotification:
          'File "missing.ts" was not found in the parsed repository.',
      });
    });

    rerender();

    expect(fallbackMock).toHaveBeenCalledWith(
      'File "missing.ts" was not found in the parsed repository.',
    );
    expect(replaceStateSpy).toHaveBeenCalled();
    expect(useGraphStore.getState().fallbackNotification).toBeNull();
  });

  it("switches workspace right tab to code when URL deep link activates a target (AC-1, AC-7)", () => {
    // Start with inspector tab active and panel collapsed
    useWorkspaceStore.getState().setActiveRightTab("inspector");
    useWorkspaceStore.getState().setRightPanelCollapsed(true);

    const { rerender } = renderHook(() => useDeepLinking());

    // Simulate URL deep link target activation
    act(() => {
      useGraphStore.getState().navigateToTarget({
        fileId: "file:src/index.ts",
        line: 14,
        source: "url",
        timestamp: Date.now(),
      });
    });

    rerender();

    expect(useWorkspaceStore.getState().activeRightTab).toBe("code");
    expect(useWorkspaceStore.getState().isRightPanelCollapsed).toBe(false);
  });

  it("accepts colons in file and repo query parameters (AC-1)", () => {
    mockSearchParams = new URLSearchParams(
      "repo=https://github.com/org/repo&file=file:src/main.ts&line=10",
    );
    const fallbackMock = vi.fn();

    act(() => {
      renderHook(() => useDeepLinking(fallbackMock));
    });

    expect(fallbackMock).not.toHaveBeenCalled();
    const pending = useGraphStore.getState().pendingTarget;
    expect(pending?.fileId).toBe("file:src/main.ts");
    expect(pending?.line).toBe(10);
  });

  it("rejects path traversal attempts in query params (AC-6)", () => {
    mockSearchParams = new URLSearchParams(
      "repo=org/repo&file=../../etc/passwd&line=1",
    );
    const fallbackMock = vi.fn();

    act(() => {
      renderHook(() => useDeepLinking(fallbackMock));
    });

    expect(fallbackMock).toHaveBeenCalledWith(
      expect.stringContaining("Invalid deep link"),
    );
    expect(useGraphStore.getState().pendingTarget).toBeNull();
  });

  it("rejects non-numeric line parameters (AC-6)", () => {
    mockSearchParams = new URLSearchParams(
      "repo=org/repo&file=src/main.ts&line=10abc",
    );
    const fallbackMock = vi.fn();

    act(() => {
      renderHook(() => useDeepLinking(fallbackMock));
    });

    expect(fallbackMock).toHaveBeenCalledWith(
      expect.stringContaining("Invalid deep link"),
    );
    expect(useGraphStore.getState().pendingTarget).toBeNull();
  });

  it("deselects file when popstate event has no file parameter (AC-1)", () => {
    useGraphStore.getState().selectNode("file:src/index.ts");
    expect(useGraphStore.getState().selectedFileId).toBe("file:src/index.ts");

    renderHook(() => useDeepLinking());

    // Simulate browser back button navigation where window.location has no file param
    Object.defineProperty(window, "location", {
      writable: true,
      value: new URL("http://localhost:3000/?repo=test/repo"),
    });

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(useGraphStore.getState().selectedFileId).toBeNull();
    expect(useGraphStore.getState().activeTarget).toBeNull();
  });

  it("uses router.replace for discrete canvas clicks to preserve navigation history (AC-1)", () => {
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

    const { rerender } = renderHook(() => useDeepLinking());

    // Trigger canvas node click
    act(() => {
      useGraphStore.getState().navigateToTarget({
        fileId: "file:src/index.ts",
        source: "canvas",
        timestamp: Date.now(),
      });
    });

    rerender();

    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining(
        "repo=test%2Frepo&branch=main&file=src%2Findex.ts",
      ),
      { scroll: false },
    );
  });

  it("opens right drawer when active target arrives on small screens (AC-1, AC-7)", () => {
    useWorkspaceStore.getState().setSmallScreen(true);
    useWorkspaceStore.getState().setRightDrawerOpen(false);

    const { rerender } = renderHook(() => useDeepLinking());

    act(() => {
      useGraphStore.getState().navigateToTarget({
        fileId: "file:src/index.ts",
        source: "url",
        timestamp: Date.now(),
      });
    });

    rerender();

    expect(useWorkspaceStore.getState().isRightDrawerOpen).toBe(true);
  });

  it("matches symbol entity during popstate back navigation (AC-1)", () => {
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
        totalSymbols: 1,
        languages: { typescript: 1 },
        schemaVersion: 1,
      },
      directories: {},
      files: {
        "file:src/utils.ts": {
          id: "file:src/utils.ts",
          path: "src/utils.ts",
          name: "utils.ts",
          extension: ".ts",
          language: "typescript",
          sizeBytes: 100,
          lineCount: 20,
          directoryId: "dir:src",
          symbolIds: ["symbol:src/utils.ts#calc"],
          importIds: [],
          exportIds: [],
        },
      },
      symbols: {
        "symbol:src/utils.ts#calc": {
          id: "symbol:src/utils.ts#calc",
          fileId: "file:src/utils.ts",
          parentSymbolId: null,
          name: "calc",
          kind: "function",
          range: {
            startLine: 5,
            startColumn: 1,
            endLine: 10,
            endColumn: 1,
            startOffset: 50,
            endOffset: 100,
          },
          selectionRange: {
            startLine: 5,
            startColumn: 10,
            endLine: 5,
            endColumn: 14,
            startOffset: 59,
            endOffset: 63,
          },
          isExported: true,
          isDefaultExport: false,
          signature: "function calc()",
          documentation: null,
          visibility: "public",
          childSymbolIds: [],
        },
      },
      externalModules: {},
      edges: {},
    } as unknown as CodebaseGraph;

    useGraphStore.getState().setGraph(mockGraph);
    renderHook(() => useDeepLinking());

    Object.defineProperty(window, "location", {
      writable: true,
      value: new URL(
        "http://localhost:3000/?repo=test/repo&file=src/utils.ts&line=5&symbol=calc",
      ),
    });

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    const activeTarget = useGraphStore.getState().activeTarget;
    expect(activeTarget?.fileId).toBe("file:src/utils.ts");
    expect(activeTarget?.symbolId).toBe("symbol:src/utils.ts#calc");
    expect(activeTarget?.line).toBe(5);
  });
});
