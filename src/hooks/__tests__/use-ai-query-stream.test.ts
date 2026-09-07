import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAiQueryStream } from "../use-ai-query-stream";
import type { CodebaseGraph, Repository } from "@/entities";

// covers: AC-1
describe("useAiQueryStream", () => {
  const mockRepo: Repository = {
    id: "repo:test/app",
    owner: "test",
    name: "app",
    fullName: "test/app",
    defaultBranch: "main",
    commitSha: "123456",
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
    files: {},
    symbols: {},
    externalModules: {},
    edges: {},
  } as unknown as CodebaseGraph;

  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("starts in idle state with streaming inactive (covers: AC-1)", () => {
    const { result } = renderHook(() => useAiQueryStream());
    expect(result.current.isStreaming).toBe(false);
  });

  it("processes streaming text chunks and fires completion (covers: AC-1)", async () => {
    const ssePayload = [
      'data: {"type":"text","text":"First chunk "}\n\n',
      'data: {"type":"text","text":"second chunk."}\n\n',
      'data: {"type":"done"}\n\n',
    ].join("");

    const mockResponse = new Response(ssePayload, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });

    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useAiQueryStream());

    const onTextChunk = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();

    await act(async () => {
      await result.current.streamQuery({
        repository: mockRepo,
        graph: mockGraph,
        contextSummary: "Summary",
        messages: [{ role: "user", content: "Explain system" }],
        isDemo: true,
        onTextChunk,
        onComplete,
        onError,
      });
    });

    expect(onTextChunk).toHaveBeenCalledTimes(2);
    expect(onTextChunk).toHaveBeenNthCalledWith(1, "First chunk ");
    expect(onTextChunk).toHaveBeenNthCalledWith(2, "second chunk.");
    expect(onComplete).toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(result.current.isStreaming).toBe(false);
  });

  it("delivers trace citations and warning events (covers: AC-1, AC-4)", async () => {
    const mockTrace = {
      id: "trace:src/a->src/b",
      sourceNodeId: "file:src/a.ts",
      targetNodeId: "file:src/b.ts",
      stepNodeIds: ["file:src/a.ts", "file:src/b.ts"],
      stepEdgeIds: ["edge:a->b"],
      hopCount: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
    };

    const mockCitations = [
      {
        id: "cite:file:src/a.ts_1",
        fileId: "file:src/a.ts",
        line: 1,
        column: 1,
        label: "a.ts",
      },
    ];

    const ssePayload = [
      `data: {"type":"trace","trace":${JSON.stringify(mockTrace)}}\n\n`,
      `data: {"type":"citations","citations":${JSON.stringify(mockCitations)}}\n\n`,
      'data: {"type":"warning","message":"Notice regarding path"}\n\n',
      'data: {"type":"done"}\n\n',
    ].join("");

    global.fetch = vi.fn().mockResolvedValue(
      new Response(ssePayload, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );

    const { result } = renderHook(() => useAiQueryStream());

    const onTrace = vi.fn();
    const onCitations = vi.fn();
    const onWarning = vi.fn();

    await act(async () => {
      await result.current.streamQuery({
        repository: mockRepo,
        graph: mockGraph,
        contextSummary: "Summary",
        messages: [{ role: "user", content: "Trace a to b" }],
        onTrace,
        onCitations,
        onWarning,
      });
    });

    expect(onTrace).toHaveBeenCalledWith(mockTrace);
    expect(onCitations).toHaveBeenCalledWith(mockCitations);
    expect(onWarning).toHaveBeenCalledWith("Notice regarding path");
  });

  it("handles non 200 HTTP responses and invokes error callback (covers: AC-1)", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { result } = renderHook(() => useAiQueryStream());
    const onError = vi.fn();

    await act(async () => {
      await result.current.streamQuery({
        repository: mockRepo,
        graph: mockGraph,
        contextSummary: "Summary",
        messages: [{ role: "user", content: "Hello" }],
        onError,
      });
    });

    expect(onError).toHaveBeenCalledWith("Rate limit exceeded");
    expect(result.current.isStreaming).toBe(false);
  });

  it("handles network failure and invokes error callback (covers: AC-1)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Connection reset"));

    const { result } = renderHook(() => useAiQueryStream());
    const onError = vi.fn();

    await act(async () => {
      await result.current.streamQuery({
        repository: mockRepo,
        graph: mockGraph,
        contextSummary: "Summary",
        messages: [{ role: "user", content: "Hello" }],
        onError,
      });
    });

    expect(onError).toHaveBeenCalledWith("Connection reset");
    expect(result.current.isStreaming).toBe(false);
  });

  it("aborts active query when abortQuery is called (covers: AC-1)", async () => {
    const abortListener = vi.fn();

    const stream = new ReadableStream({
      start() {
        // Keeps stream open
      },
      cancel() {
        abortListener();
      },
    });

    global.fetch = vi.fn().mockImplementation((_url, init: RequestInit) => {
      if (init.signal) {
        init.signal.addEventListener("abort", () => {
          abortListener();
        });
      }
      return Promise.resolve(new Response(stream, { status: 200 }));
    });

    const { result } = renderHook(() => useAiQueryStream());

    let promise: Promise<void>;
    act(() => {
      promise = result.current.streamQuery({
        repository: mockRepo,
        graph: mockGraph,
        contextSummary: "Summary",
        messages: [{ role: "user", content: "Long query" }],
      });
    });

    expect(result.current.isStreaming).toBe(true);

    await act(async () => {
      result.current.abortQuery();
      await promise;
    });

    expect(result.current.isStreaming).toBe(false);
  });
});
