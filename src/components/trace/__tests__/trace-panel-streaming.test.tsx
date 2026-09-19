import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { TracePanel } from "../trace-panel";
import { useGraphStore } from "@/stores/graph-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { CodebaseGraph, Repository } from "@/entities";
import type { StreamQueryOptions } from "@/hooks/use-ai-query-stream";

const hoisted = vi.hoisted(() => ({
  renderedContents: [] as string[],
  capturedOptions: { current: null as StreamQueryOptions | null },
  abortQuery: vi.fn(),
}));

vi.mock("../markdown-message", () => ({
  MarkdownMessage: ({ content }: { content: string }) => {
    hoisted.renderedContents.push(content);
    return <div data-testid="markdown">{content}</div>;
  },
}));

vi.mock("@/hooks/use-ai-query-stream", () => ({
  useAiQueryStream: () => ({
    isStreaming: false,
    streamQuery: (options: StreamQueryOptions) => {
      hoisted.capturedOptions.current = options;
      // Stays pending so the test drives the stream by calling the callbacks.
      return new Promise<void>(() => {});
    },
    retryLastQuery: vi.fn(),
    abortQuery: hoisted.abortQuery,
    lastQueryOptionsRef: { current: null },
  }),
}));

window.HTMLElement.prototype.scrollIntoView = vi.fn();

describe("TracePanel streaming text coalescing (0013 AC-5)", () => {
  const originalFetch = global.fetch;
  const mockRepo: Repository = {
    id: "repo:test/app",
    owner: "test",
    name: "app",
    fullName: "test/app",
    defaultBranch: "main",
    commitSha: "sha1",
    analyzedAt: "2026-01-01T00:00:00.000Z",
    totalFiles: 1,
    totalSymbols: 0,
    languages: { typescript: 1 },
    schemaVersion: 1,
  };
  const mockGraph = {
    schemaVersion: 1,
    repository: mockRepo,
    directories: {},
    files: {
      "file:src/a.ts": {
        id: "file:src/a.ts",
        path: "src/a.ts",
        name: "a.ts",
        directoryId: "dir:src",
        extension: "ts",
        lineCount: 10,
        symbolIds: [],
      },
    },
    symbols: {},
    externalModules: {},
    edges: {},
  } as unknown as CodebaseGraph;

  let frameCallbacks: FrameRequestCallback[] = [];
  const runFrame = () => {
    const pending = frameCallbacks;
    frameCallbacks = [];
    act(() => {
      pending.forEach((cb) => cb(0));
    });
  };

  const startStream = () => {
    fireEvent.click(
      screen.getByRole("button", { name: /Core bottleneck \/ central files/ }),
    );
    const options = hoisted.capturedOptions.current;
    if (!options) throw new Error("streamQuery was not called");
    return options;
  };

  beforeEach(() => {
    sessionStorage.clear();
    hoisted.renderedContents.length = 0;
    hoisted.capturedOptions.current = null;
    frameCallbacks = [];
    useGraphStore.getState().reset();
    useWorkspaceStore.getState().resetLayout();
    useGraphStore.getState().setGraph(mockGraph);
    global.fetch = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback): number =>
      frameCallbacks.push(cb),
    );
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      frameCallbacks[id - 1] = () => {};
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllGlobals();
  });

  it("schedules a single animation frame for ten chunks that arrive inside one frame (covers: AC-5)", () => {
    render(<TracePanel />);
    const options = startStream();

    act(() => {
      for (let i = 0; i < 10; i++) options.onTextChunk?.(`w${i} `);
    });

    expect(frameCallbacks).toHaveLength(1);
  });

  it("renders no partial text before the frame fires and the full text once after it (covers: AC-5)", () => {
    render(<TracePanel />);
    const options = startStream();
    const rendersBefore = hoisted.renderedContents.length;

    act(() => {
      for (let i = 0; i < 10; i++) options.onTextChunk?.(`w${i} `);
    });
    expect(hoisted.renderedContents.slice(rendersBefore)).not.toContain("w0 ");
    expect(screen.queryByText(/w9/)).not.toBeInTheDocument();

    runFrame();

    const fullText = Array.from({ length: 10 }, (_, i) => `w${i} `).join("");
    const newRenders = hoisted.renderedContents
      .slice(rendersBefore)
      .filter((c) => c.includes("w"));
    expect(new Set(newRenders)).toEqual(new Set([fullText]));
    expect(screen.getByTestId("markdown")).toHaveTextContent("w0 w1 w2");
  });

  it("schedules a new frame for chunks that arrive after a frame flushed (covers: AC-5)", () => {
    render(<TracePanel />);
    const options = startStream();
    act(() => {
      options.onTextChunk?.("first ");
    });
    runFrame();

    act(() => {
      options.onTextChunk?.("second ");
    });

    expect(frameCallbacks).toHaveLength(1);
    runFrame();
    expect(screen.getByTestId("markdown")).toHaveTextContent("first second");
  });

  it("flushes pending text synchronously on complete without waiting for a frame (covers: AC-5)", () => {
    render(<TracePanel />);
    const options = startStream();

    act(() => {
      options.onTextChunk?.("done ");
      options.onTextChunk?.("text");
      options.onComplete?.();
    });

    expect(screen.getByTestId("markdown")).toHaveTextContent("done text");
    const stored = JSON.parse(
      sessionStorage.getItem("cv:thread:test/app") ?? "[]",
    ) as { role: string; status: string; content: string }[];
    const assistant = stored.find((m) => m.role === "assistant");
    expect(assistant?.status).toBe("complete");
    expect(assistant?.content).toBe("done text");
  });

  it("does not render the answer highlight until the highlight event arrives (covers: AC-6)", () => {
    render(<TracePanel />);
    const options = startStream();

    act(() => {
      options.onTextChunk?.("text");
    });
    expect(useGraphStore.getState().highlightSource).toBeNull();

    act(() => {
      options.onHighlight?.(["file:src/a.ts"]);
    });

    expect(useGraphStore.getState().highlightSource).toBe("answer");
    expect(useGraphStore.getState().highlightedNodeIds).toEqual([
      "file:src/a.ts",
    ]);
  });
});
