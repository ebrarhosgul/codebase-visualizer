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
});
