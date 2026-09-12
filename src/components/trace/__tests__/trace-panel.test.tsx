import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TracePanel } from "../trace-panel";
import { useGraphStore } from "@/stores/graph-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { CodebaseGraph, Repository } from "@/entities";

// Mock scrollIntoView
window.HTMLElement.prototype.scrollIntoView = vi.fn();

describe("TracePanel", () => {
  const mockRepo: Repository = {
    id: "repo:test/app",
    owner: "test",
    name: "app",
    fullName: "test/app",
    defaultBranch: "main",
    commitSha: "sha1",
    analyzedAt: "2026-01-01T00:00:00.000Z",
    totalFiles: 2,
    totalSymbols: 0,
    languages: { typescript: 2 },
    schemaVersion: 1,
  };

  const mockGraph = {
    schemaVersion: 1,
    repository: mockRepo,
    directories: {},
    files: {
      "file:src/index.ts": {
        id: "file:src/index.ts",
        path: "src/index.ts",
        name: "index.ts",
        directoryId: "dir:src",
        extension: "ts",
        lineCount: 20,
        characterCount: 300,
        symbolIds: [],
        outgoingImportFileIds: ["file:src/api.ts"],
      },
      "file:src/api.ts": {
        id: "file:src/api.ts",
        path: "src/api.ts",
        name: "api.ts",
        directoryId: "dir:src",
        extension: "ts",
        lineCount: 30,
        characterCount: 450,
        symbolIds: [],
        outgoingImportFileIds: [],
      },
    },
    symbols: {},
    externalModules: {},
    edges: {
      "edge:index->api": {
        id: "edge:index->api",
        sourceId: "file:src/index.ts",
        targetId: "file:src/api.ts",
        kind: "file_import",
      },
    },
  } as unknown as CodebaseGraph;

  beforeEach(() => {
    sessionStorage.clear();
    useGraphStore.getState().reset();
    useWorkspaceStore.getState().resetLayout();
    useGraphStore.getState().setGraph(mockGraph);
    vi.restoreAllMocks();
  });

  it("renders panel header, demo badge, and suggested prompt pills", () => {
    render(<TracePanel />);

    expect(screen.getByText("Semantic Trace")).toBeInTheDocument();
    expect(screen.getByText("Demo Mode")).toBeInTheDocument();
    expect(screen.getByText("Suggested Prompts")).toBeInTheDocument();
    expect(
      screen.getByText("How do stores connect to canvas?"),
    ).toBeInTheDocument();
  });

  it("submits a query when a suggested prompt pill is clicked", async () => {
    // Mock global fetch for /api/ai/query
    const sseChunks = [
      'data: {"type":"text","text":"Analysis of stores and canvas..."}\n\n',
      'data: {"type":"trace","trace":{"id":"trace:file:src/index.ts->file:src/api.ts","sourceNodeId":"file:src/index.ts","targetNodeId":"file:src/api.ts","stepNodeIds":["file:src/index.ts","file:src/api.ts"],"stepEdgeIds":["edge:index->api"],"hopCount":1,"rationale":"Import","createdAt":"2026-01-01T00:00:00.000Z"}}\n\n',
      'data: {"type":"citations","citations":[{"id":"cite:file:src/index.ts_1","fileId":"file:src/index.ts","line":1,"label":"index.ts"}]}\n\n',
      'data: {"type":"done"}\n\n',
    ];

    const stream = new ReadableStream({
      start(controller) {
        for (const chunk of sseChunks) {
          controller.enqueue(new TextEncoder().encode(chunk));
        }
        controller.close();
      },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: stream,
    } as unknown as Response);

    render(<TracePanel />);

    const pill = screen.getByText("How do stores connect to canvas?");
    fireEvent.click(pill);

    await waitFor(() => {
      expect(
        screen.getByText("Analysis of stores and canvas..."),
      ).toBeInTheDocument();
    });

    // Check that path trace card and citation chip rendered
    expect(screen.getByTestId("path-trace-card")).toBeInTheDocument();
    expect(screen.getByText("index.ts:1")).toBeInTheDocument();
  });

  it("executes dual action navigation and focuses code tab when citation chip is clicked", async () => {
    // Mock sessionStorage with existing message containing citations
    const existingThread = [
      {
        id: "msg:1_user",
        threadId: "test/app",
        role: "user",
        content: "Trace path",
        status: "complete",
        citations: [],
        isPathVerified: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: "msg:2_assistant",
        threadId: "test/app",
        role: "assistant",
        content: "Here is the response with citation.",
        status: "complete",
        pathTrace: {
          id: "trace:file:src/index.ts->file:src/api.ts",
          sourceNodeId: "file:src/index.ts",
          targetNodeId: "file:src/api.ts",
          stepNodeIds: ["file:src/index.ts", "file:src/api.ts"],
          stepEdgeIds: ["edge:index->api"],
          hopCount: 1,
          rationale: "Import",
          createdAt: new Date().toISOString(),
        },
        citations: [
          {
            id: "cite:file:src/api.ts_15",
            fileId: "file:src/api.ts",
            line: 15,
            label: "api.ts",
          },
        ],
        isPathVerified: true,
        createdAt: new Date().toISOString(),
      },
    ];

    sessionStorage.setItem(
      "cv:thread:test/app",
      JSON.stringify(existingThread),
    );

    render(<TracePanel />);

    const citationChip = screen.getByText("api.ts:15");
    expect(citationChip).toBeInTheDocument();

    fireEvent.click(citationChip);

    // Verify dual action: navigateToTarget called, activeRightTab switched to code
    expect(useWorkspaceStore.getState().activeRightTab).toBe("code");
    expect(useGraphStore.getState().activeTarget?.fileId).toBe(
      "file:src/api.ts",
    );
    expect(useGraphStore.getState().activeTarget?.line).toBe(15);
  });

  it("sets active step and highlights canvas when stepping through path trace", () => {
    const existingThread = [
      {
        id: "msg:1_assistant",
        threadId: "test/app",
        role: "assistant",
        content: "Path found",
        status: "complete",
        pathTrace: {
          id: "trace:file:src/index.ts->file:src/api.ts",
          sourceNodeId: "file:src/index.ts",
          targetNodeId: "file:src/api.ts",
          stepNodeIds: ["file:src/index.ts", "file:src/api.ts"],
          stepEdgeIds: ["edge:index->api"],
          hopCount: 1,
          rationale: "Import",
          createdAt: new Date().toISOString(),
        },
        citations: [],
        isPathVerified: true,
        createdAt: new Date().toISOString(),
      },
    ];

    sessionStorage.setItem(
      "cv:thread:test/app",
      JSON.stringify(existingThread),
    );

    render(<TracePanel />);

    const stepButton = screen.getByTitle("Step 2: src/api.ts");
    fireEvent.click(stepButton);

    expect(useGraphStore.getState().activeStepIndex).toBe(1);
    expect(useGraphStore.getState().selectedNodeId).toBe("file:src/api.ts");
  });

  it("renders FallbackNoticeCard and preserves partial streamed text on error", () => {
    const existingThread = [
      {
        id: "msg:user_1",
        threadId: "test/app",
        role: "user",
        content: "Explain auth flow",
        status: "complete",
        citations: [],
        isPathVerified: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: "msg:assistant_1",
        threadId: "test/app",
        role: "assistant",
        content:
          "Here is the partial architecture explanation before failure...",
        status: "error",
        errorMessage: "The upstream provider is unavailable.",
        fallbackNotice: {
          code: "provider_outage",
          title: "Provider Service Outage",
          message: "The upstream provider is unavailable.",
          suggestedAction: "switch_demo",
        },
        citations: [],
        isPathVerified: false,
        createdAt: new Date().toISOString(),
      },
    ];

    sessionStorage.setItem(
      "cv:thread:test/app",
      JSON.stringify(existingThread),
    );

    render(<TracePanel />);

    // Check that partial text remains visible
    expect(
      screen.getByText(
        "Here is the partial architecture explanation before failure...",
      ),
    ).toBeInTheDocument();

    // Check that FallbackNoticeCard mounts
    expect(screen.getByTestId("fallback-notice-card")).toBeInTheDocument();
    expect(screen.getByText("Provider Service Outage")).toBeInTheDocument();
    expect(
      screen.getByText("The upstream provider is unavailable."),
    ).toBeInTheDocument();
  });

  it("opens key settings dialog when clicking Open Key Settings on auth error notice", () => {
    const existingThread = [
      {
        id: "msg:assistant_auth",
        threadId: "test/app",
        role: "assistant",
        content: "",
        status: "error",
        errorMessage: "API key is required.",
        fallbackNotice: {
          code: "auth_error",
          title: "API Key Required",
          message: "Please configure your API key.",
          suggestedAction: "open_keys",
        },
        citations: [],
        isPathVerified: false,
        createdAt: new Date().toISOString(),
      },
    ];

    sessionStorage.setItem(
      "cv:thread:test/app",
      JSON.stringify(existingThread),
    );

    render(<TracePanel />);

    const openKeysBtn = screen.getByRole("button", {
      name: /open key settings/i,
    });
    fireEvent.click(openKeysBtn);

    expect(screen.getByText("Bring Your Own Key (BYOK)")).toBeInTheDocument();
  });

  it("initializes in BYOK mode when /api/ai/keys returns stored provider on mount (covers: AC-3)", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/ai/keys") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ hasKey: true, provider: "openai" }),
        } as unknown as Response);
      }
      return Promise.reject(new Error("unexpected call"));
    });

    render(<TracePanel />);

    await waitFor(() => {
      expect(screen.getByText("OPENAI")).toBeInTheDocument();
    });
    expect(screen.queryByText("Demo Mode")).not.toBeInTheDocument();
  });

  it("defaults silently to demo mode when /api/ai/keys check fails on mount (covers: AC-5)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    render(<TracePanel />);

    await waitFor(() => {
      expect(screen.getByText("Demo Mode")).toBeInTheDocument();
    });
  });

  it("disables prompt buttons and textarea when graph is not loaded (covers: AC-2)", () => {
    useGraphStore.getState().reset();

    render(<TracePanel />);

    const promptButton = screen.getByText("How do stores connect to canvas?");
    expect(promptButton).toBeDisabled();
    expect(promptButton).toHaveAttribute(
      "title",
      "Load a repository to ask questions",
    );

    const textarea = screen.getByPlaceholderText(
      "Load a repository to ask questions...",
    );
    expect(textarea).toBeDisabled();
  });

  it("switches to demo mode and retries query when Switch to Demo Mode is clicked on fallback notice card (covers: AC-3, AC-5)", async () => {
    const sseChunks = [
      'data: {"type":"text","text":"Demo fallback answer resolved successfully"}\n\n',
      'data: {"type":"done"}\n\n',
    ];

    const stream = new ReadableStream({
      start(controller) {
        for (const chunk of sseChunks) {
          controller.enqueue(new TextEncoder().encode(chunk));
        }
        controller.close();
      },
    });

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/ai/keys") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ hasKey: false }),
        } as unknown as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        body: stream,
      } as unknown as Response);
    });

    const existingThread = [
      {
        id: "msg:user_1",
        threadId: "test/app",
        role: "user",
        content: "Explain system architecture",
        status: "complete",
        citations: [],
        isPathVerified: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: "msg:assistant_1",
        threadId: "test/app",
        role: "assistant",
        content: "Partial before failure",
        status: "error",
        errorMessage: "Rate limit exceeded",
        fallbackNotice: {
          code: "rate_limit",
          title: "Rate Limit Exceeded",
          message: "Please wait or switch to demo mode.",
          suggestedAction: "switch_demo",
          retryAfterSeconds: 30,
        },
        citations: [],
        isPathVerified: false,
        createdAt: new Date().toISOString(),
      },
    ];

    sessionStorage.setItem(
      "cv:thread:test/app",
      JSON.stringify(existingThread),
    );

    render(<TracePanel />);

    const switchBtn = screen.getByRole("button", {
      name: /switch to demo mode/i,
    });
    fireEvent.click(switchBtn);

    await waitFor(() => {
      expect(
        screen.getByText("Demo fallback answer resolved successfully"),
      ).toBeInTheDocument();
    });
  });

  it("retries assistant query when retry button is clicked on fallback notice card (covers: AC-3)", async () => {
    const sseChunks = [
      'data: {"type":"text","text":"Retried response completed"}\n\n',
      'data: {"type":"done"}\n\n',
    ];

    const stream = new ReadableStream({
      start(controller) {
        for (const chunk of sseChunks) {
          controller.enqueue(new TextEncoder().encode(chunk));
        }
        controller.close();
      },
    });

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/ai/keys") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ hasKey: false }),
        } as unknown as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        body: stream,
      } as unknown as Response);
    });

    const existingThread = [
      {
        id: "msg:user_retry",
        threadId: "test/app",
        role: "user",
        content: "Trace entrypoint",
        status: "complete",
        citations: [],
        isPathVerified: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: "msg:assistant_retry",
        threadId: "test/app",
        role: "assistant",
        content: "",
        status: "error",
        errorMessage: "Provider outage",
        fallbackNotice: {
          code: "provider_outage",
          title: "Provider Service Outage",
          message: "Temporary outage",
          suggestedAction: "switch_demo",
        },
        citations: [],
        isPathVerified: false,
        createdAt: new Date().toISOString(),
      },
    ];

    sessionStorage.setItem(
      "cv:thread:test/app",
      JSON.stringify(existingThread),
    );

    render(<TracePanel />);

    const retryBtn = screen.getByRole("button", { name: /retry now/i });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(
        screen.getByText("Retried response completed"),
      ).toBeInTheDocument();
    });
  });

  it("clears chat history and active trace when clear chat button is clicked", () => {
    const existingThread = [
      {
        id: "msg:user_1",
        threadId: "test/app",
        role: "user",
        content: "Hello",
        status: "complete",
        citations: [],
        isPathVerified: true,
        createdAt: new Date().toISOString(),
      },
    ];

    sessionStorage.setItem(
      "cv:thread:test/app",
      JSON.stringify(existingThread),
    );

    render(<TracePanel />);

    expect(screen.getByText("Hello")).toBeInTheDocument();

    const clearButton = screen.getByTitle("Clear thread history");
    fireEvent.click(clearButton);

    expect(screen.queryByText("Hello")).not.toBeInTheDocument();
    expect(screen.getByText("Ask Architectural Questions")).toBeInTheDocument();
  });
});
