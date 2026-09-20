import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
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
      screen.getByText("Architecture & layer breakdown"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Core bottleneck / central files"),
    ).toBeInTheDocument();
    expect(screen.getByText("State management flow")).toBeInTheDocument();
  });

  it("submits a query when a suggested prompt pill is clicked", async () => {
    render(<TracePanel />);

    const pill = screen
      .getByText("Core bottleneck / central files")
      .closest("button")!;
    fireEvent.click(pill);

    await waitFor(
      () => {
        expect(screen.getByText(/Core Central Files/i)).toBeInTheDocument();
        expect(
          screen.getByText(
            "Which files are the core bottlenecks or most central modules?",
          ),
        ).toBeInTheDocument();
        expect(screen.getByText(/src\/api\.ts/i)).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
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

    const promptButton = screen
      .getByText("Architecture & layer breakdown")
      .closest("button");
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
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/ai/keys") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ hasKey: true, provider: "gemini" }),
        } as unknown as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        body: new ReadableStream({
          start(c) {
            c.close();
          },
        }),
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

    await waitFor(() => {
      expect(screen.getByText("GEMINI")).toBeInTheDocument();
    });

    const switchBtn = screen.getByRole("button", {
      name: /switch to demo mode/i,
    });
    fireEvent.click(switchBtn);

    await waitFor(
      () => {
        expect(
          screen.getByText(/Architecture & Layer Breakdown/i),
        ).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
    expect(screen.getByText("Demo Mode")).toBeInTheDocument();
  });

  it("retries assistant query when retry button is clicked on fallback notice card (covers: AC-3)", async () => {
    const createStream = () =>
      new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              'data: {"type":"text","text":"Retried response completed"}\n\n' +
                'data: {"type":"done"}\n\n',
            ),
          );
          controller.close();
        },
      });

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/ai/keys") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ hasKey: true, provider: "gemini" }),
        } as unknown as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        body: createStream(),
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

    await waitFor(() => {
      expect(screen.getByText("GEMINI")).toBeInTheDocument();
    });

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

  it("renders structured markdown formatting in assistant messages", () => {
    const existingThread = [
      {
        id: "msg:assistant_md",
        threadId: "test/app",
        role: "assistant",
        content: `### Connection & Data Flow

1. **State Provider Hook (\`hooks/useTelemetry.ts\`)**:
- Manages real-time telemetry state updates.

\`\`\`typescript
export function useTelemetry() { return {}; }
\`\`\``,
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

    // Renders heading with level 3
    const heading = screen.getByRole("heading", { level: 3 });
    expect(heading).toHaveTextContent("Connection & Data Flow");

    // Renders list number badge
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText(/State Provider Hook/)).toBeInTheDocument();

    // Renders code block with language badge
    expect(screen.getByText("typescript")).toBeInTheDocument();
    expect(
      screen.getByText(/export function useTelemetry/),
    ).toBeInTheDocument();

    // Renders assistant message header and copy response button
    expect(screen.getByText("Semantic Assistant")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /copy response/i }),
    ).toBeInTheDocument();
  });

  it("copies assistant message content to clipboard and reveals temporary copied feedback", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    const existingThread = [
      {
        id: "msg:assistant_copy_test",
        threadId: "test/app",
        role: "assistant",
        content: "Detailed explanation of application stores and hooks.",
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

    const copyBtn = screen.getByRole("button", { name: /copy response/i });
    expect(copyBtn).toBeInTheDocument();

    await React.act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(writeTextMock).toHaveBeenCalledWith(
      "Detailed explanation of application stores and hooks.",
    );
    expect(
      screen.getByRole("button", { name: /response copied/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Copied")).toBeInTheDocument();
  });

  it("navigates to code viewer when clicking recognized file path in assistant message", () => {
    const existingThread = [
      {
        id: "msg:assistant_nav_test",
        threadId: "test/app",
        role: "assistant",
        content: "Inspect the entrypoint at `src/index.ts` to see imports.",
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

    const fileButton = screen.getByRole("button", { name: /src\/index\.ts/i });
    expect(fileButton).toBeInTheDocument();

    fireEvent.click(fileButton);

    expect(useWorkspaceStore.getState().activeRightTab).toBe("code");
    expect(useGraphStore.getState().activeTarget?.fileId).toBe(
      "file:src/index.ts",
    );
    expect(useGraphStore.getState().activeTarget?.line).toBe(1);
  });

  it("does not provide file navigation button for unrecognized inline code snippets", () => {
    const existingThread = [
      {
        id: "msg:assistant_unrecognized_code",
        threadId: "test/app",
        role: "assistant",
        content: "Call `calculateLayout()` before dispatching canvas actions.",
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

    expect(screen.getByText("calculateLayout()")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /calculateLayout\(\)/i }),
    ).not.toBeInTheDocument();
  });

  it("hides copy response button while assistant message is streaming", () => {
    const existingThread = [
      {
        id: "msg:assistant_streaming",
        threadId: "test/app",
        role: "assistant",
        content: "Beginning architectural review...",
        status: "streaming",
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

    expect(
      screen.queryByRole("button", { name: /copy response/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Beginning architectural review..."),
    ).toBeInTheDocument();
  });

  it("handles clipboard write failure gracefully on copy response", async () => {
    const writeTextMock = vi
      .fn()
      .mockRejectedValue(new Error("Permission denied"));
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    const existingThread = [
      {
        id: "msg:assistant_fail_copy",
        threadId: "test/app",
        role: "assistant",
        content: "Content to copy.",
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

    const copyBtn = screen.getByRole("button", { name: /copy response/i });
    await React.act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(writeTextMock).toHaveBeenCalled();
    expect(screen.getByText("Content to copy.")).toBeInTheDocument();
  });

  describe("zero friction demo mode (0013)", () => {
    const originalFetch = global.fetch;
    const demoTooltip =
      "Answers are computed from the loaded dependency graph in your browser. No AI model is involved.";
    const footerText =
      "Computed from the loaded dependency graph, no AI model involved.";

    const assistantMessage = (
      id: string,
      provenance?: "heuristic" | "model",
      content = "Seeded answer text.",
    ) => ({
      id,
      threadId: "test/app",
      role: "assistant",
      content,
      status: "complete",
      citations: [],
      isPathVerified: false,
      createdAt: new Date().toISOString(),
      ...(provenance ? { provenance } : {}),
    });

    const userMessage = (id: string, content: string) => ({
      id,
      threadId: "test/app",
      role: "user",
      content,
      status: "complete",
      citations: [],
      isPathVerified: false,
      createdAt: new Date().toISOString(),
    });

    const seedThread = (messages: readonly object[]) =>
      sessionStorage.setItem("cv:thread:test/app", JSON.stringify(messages));

    /** Keys check reports no stored key; any other request is recorded and fails. */
    const mockNoKeyFetch = () => {
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === "/api/ai/keys") {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ hasKey: false }),
          } as unknown as Response);
        }
        return Promise.reject(new Error(`unexpected request to ${url}`));
      });
      global.fetch = fetchMock;
      return fetchMock;
    };

    /** The footer renders as soon as a heuristic message starts, so wait on the Stop button instead. */
    const waitForAnswerToFinish = async () => {
      await screen.findByTitle("Stop response");
      await waitFor(
        () => {
          expect(screen.queryByTitle("Stop response")).not.toBeInTheDocument();
        },
        { timeout: 5000 },
      );
    };

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it("shows the exact demo badge tooltip explaining no AI model is involved (covers: AC-8)", () => {
      mockNoKeyFetch();

      render(<TracePanel />);

      expect(screen.getByTitle(demoTooltip)).toHaveTextContent("Demo Mode");
    });

    it("streams a repository specific answer for a chip click with zero requests to /api/ai/query (covers: AC-1, AC-3)", async () => {
      const fetchMock = mockNoKeyFetch();
      render(<TracePanel />);

      fireEvent.click(
        screen.getByRole("button", {
          name: /Core bottleneck \/ central files/,
        }),
      );

      expect(
        screen.getByText(
          "Which files are the core bottlenecks or most central modules?",
        ),
      ).toBeInTheDocument();
      await waitForAnswerToFinish();
      expect(screen.getByText(footerText)).toBeInTheDocument();
      expect(screen.getByText(/Core Central Files/)).toBeInTheDocument();
      const queryCalls = fetchMock.mock.calls.filter(
        ([url]) => url === "/api/ai/query",
      );
      expect(queryCalls).toHaveLength(0);
    });

    it("lights up the cited files on the canvas after the answer and shows Clear Glow (covers: AC-6)", async () => {
      mockNoKeyFetch();
      render(<TracePanel />);

      fireEvent.click(
        screen.getByRole("button", {
          name: /Core bottleneck \/ central files/,
        }),
      );
      await waitForAnswerToFinish();

      const state = useGraphStore.getState();
      expect(state.highlightSource).toBe("answer");
      expect(state.highlightedNodeIds).toEqual(["file:src/api.ts"]);
      expect(state.highlightedEdgeIds).toEqual([]);
      expect(
        screen.getByRole("button", { name: "Clear Glow" }),
      ).toBeInTheDocument();
    });

    it("clears the answer highlight when Clear Glow is pressed (covers: AC-6, AC-12)", async () => {
      mockNoKeyFetch();
      render(<TracePanel />);
      fireEvent.click(
        screen.getByRole("button", {
          name: /Core bottleneck \/ central files/,
        }),
      );
      await waitForAnswerToFinish();

      fireEvent.click(screen.getByRole("button", { name: "Clear Glow" }));

      expect(useGraphStore.getState().highlightSource).toBeNull();
      expect(useGraphStore.getState().highlightedNodeIds).toEqual([]);
      expect(
        screen.queryByRole("button", { name: "Clear Glow" }),
      ).not.toBeInTheDocument();
    });

    it("clears the answer highlight when the thread is cleared (covers: AC-12)", async () => {
      mockNoKeyFetch();
      render(<TracePanel />);
      fireEvent.click(
        screen.getByRole("button", {
          name: /Core bottleneck \/ central files/,
        }),
      );
      await waitForAnswerToFinish();

      fireEvent.click(screen.getByTitle("Clear thread history"));

      expect(useGraphStore.getState().highlightSource).toBeNull();
      expect(useGraphStore.getState().highlightedNodeIds).toEqual([]);
      expect(
        screen.getByText("Ask Architectural Questions"),
      ).toBeInTheDocument();
    });

    it("clears a previous answer highlight when a new query starts (covers: AC-6, AC-12)", async () => {
      mockNoKeyFetch();
      render(<TracePanel />);
      fireEvent.click(
        screen.getByRole("button", {
          name: /Core bottleneck \/ central files/,
        }),
      );
      await waitForAnswerToFinish();
      expect(useGraphStore.getState().highlightSource).toBe("answer");

      fireEvent.click(
        screen.getByRole("button", { name: "State management flow" }),
      );

      expect(useGraphStore.getState().highlightSource).toBeNull();
    });

    it("renders the attribution footer for a heuristic message loaded after a reload (covers: AC-8)", () => {
      mockNoKeyFetch();
      seedThread([
        userMessage("msg:u1", "Which files are central?"),
        assistantMessage("msg:a1", "heuristic"),
      ]);

      render(<TracePanel />);

      expect(screen.getByText(footerText)).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Add your own key" }),
      ).toBeInTheDocument();
    });

    it("renders no footer for a legacy message without a provenance flag (covers: AC-8)", () => {
      mockNoKeyFetch();
      seedThread([
        userMessage("msg:u1", "Which files are central?"),
        assistantMessage("msg:a1"),
      ]);

      render(<TracePanel />);

      expect(screen.getByText("Seeded answer text.")).toBeInTheDocument();
      expect(screen.queryByText(footerText)).not.toBeInTheDocument();
    });

    it("renders no footer for a model provenance message (covers: AC-8)", () => {
      mockNoKeyFetch();
      seedThread([
        userMessage("msg:u1", "Which files are central?"),
        assistantMessage("msg:a1", "model"),
      ]);

      render(<TracePanel />);

      expect(screen.queryByText(footerText)).not.toBeInTheDocument();
    });

    it("opens the key settings dialog from the footer Add your own key action (covers: AC-8)", async () => {
      mockNoKeyFetch();
      seedThread([
        userMessage("msg:u1", "Which files are central?"),
        assistantMessage("msg:a1", "heuristic"),
      ]);
      render(<TracePanel />);

      fireEvent.click(screen.getByRole("button", { name: "Add your own key" }));

      expect(screen.getByText("Bring Your Own Key (BYOK)")).toBeInTheDocument();
    });

    it("keeps all three prompt chips disabled when no graph is loaded (covers: AC-10)", () => {
      mockNoKeyFetch();
      useGraphStore.getState().reset();

      render(<TracePanel />);

      for (const name of [
        /Architecture & layer breakdown/,
        /Core bottleneck \/ central files/,
        /State management flow/,
      ]) {
        expect(screen.getByRole("button", { name })).toBeDisabled();
      }
    });

    it("reads Load a repository to ask questions. in the empty state when no graph is loaded (covers: AC-10)", () => {
      mockNoKeyFetch();
      useGraphStore.getState().reset();

      render(<TracePanel />);

      expect(
        screen.getByText("Load a repository to ask questions."),
      ).toBeInTheDocument();
    });

    describe("hidden cited files", () => {
      const seedHeuristicAnswer = () =>
        seedThread([
          userMessage("msg:u1", "Which files are central?"),
          assistantMessage("msg:a1", "heuristic"),
        ]);

      it("shows how many cited files the current filters hide (covers: AC-7)", () => {
        mockNoKeyFetch();
        seedHeuristicAnswer();
        useGraphStore
          .getState()
          .setAnswerHighlight(["file:src/api.ts", "file:src/index.ts"]);
        useGraphStore.getState().setVisibleFileIds(["file:src/index.ts"]);

        render(<TracePanel />);

        expect(
          screen.getByText("1 cited file is hidden by current filters"),
        ).toBeInTheDocument();
      });

      it("uses the plural wording when several cited files are hidden (covers: AC-7)", () => {
        mockNoKeyFetch();
        seedHeuristicAnswer();
        useGraphStore
          .getState()
          .setAnswerHighlight(["file:src/api.ts", "file:src/index.ts"]);
        useGraphStore.getState().setVisibleFileIds([]);

        render(<TracePanel />);

        expect(
          screen.getByText("2 cited files are hidden by current filters"),
        ).toBeInTheDocument();
      });

      it("shows no hidden notice when every cited file is visible (covers: AC-7)", () => {
        mockNoKeyFetch();
        seedHeuristicAnswer();
        useGraphStore.getState().setAnswerHighlight(["file:src/api.ts"]);
        useGraphStore
          .getState()
          .setVisibleFileIds(["file:src/api.ts", "file:src/index.ts"]);

        render(<TracePanel />);

        expect(
          screen.queryByText(/hidden by current filters/),
        ).not.toBeInTheDocument();
      });

      it("suppresses the hidden notice while the layout is calculating (covers: AC-7)", () => {
        mockNoKeyFetch();
        seedHeuristicAnswer();
        useGraphStore.getState().setAnswerHighlight(["file:src/api.ts"]);
        useGraphStore.getState().setVisibleFileIds([]);
        useGraphStore.getState().setLayoutCalculationState(true);

        render(<TracePanel />);

        expect(
          screen.queryByText(/hidden by current filters/),
        ).not.toBeInTheDocument();
      });

      it("shows no hidden notice for a trace highlight, only for an answer highlight (covers: AC-7)", () => {
        mockNoKeyFetch();
        seedHeuristicAnswer();
        useGraphStore.getState().setActiveTrace({
          sourceNodeId: "file:src/index.ts",
          targetNodeId: "file:src/api.ts",
          stepNodeIds: ["file:src/index.ts", "file:src/api.ts"],
          stepEdgeIds: ["edge:index->api"],
          hopCount: 1,
        } as unknown as import("@/entities").PathTrace);
        useGraphStore.getState().setVisibleFileIds([]);

        render(<TracePanel />);

        expect(
          screen.queryByText(/hidden by current filters/),
        ).not.toBeInTheDocument();
      });

      it("leaves the user's filters alone until Show all is clicked (covers: AC-7)", () => {
        mockNoKeyFetch();
        seedHeuristicAnswer();
        useGraphStore.getState().setAnswerHighlight(["file:src/api.ts"]);
        useGraphStore.getState().setVisibleFileIds([]);
        useGraphStore.getState().setLayerFilters(["components"]);
        useGraphStore.getState().setSearchQuery("zzz");

        render(<TracePanel />);

        expect(useGraphStore.getState().selectedLayers).toEqual(["components"]);
        expect(useGraphStore.getState().searchQuery).toBe("zzz");
      });

      it("clears layer filters, expands folders, and clears search when Show all is clicked (covers: AC-7)", async () => {
        mockNoKeyFetch();
        seedHeuristicAnswer();
        useGraphStore.getState().setAnswerHighlight(["file:src/api.ts"]);
        useGraphStore.getState().setVisibleFileIds([]);
        useGraphStore.getState().setLayerFilters(["components"]);
        useGraphStore.getState().toggleFolderCollapse("dir:src");
        useGraphStore.getState().setSearchQuery("zzz");
        render(<TracePanel />);

        fireEvent.click(screen.getByRole("button", { name: "Show all" }));

        const state = useGraphStore.getState();
        expect(state.selectedLayers).toEqual([]);
        expect(state.collapsedFolderIds).toEqual([]);
        expect(state.searchQuery).toBe("");
      });

      it("keeps the cited files highlighted after Show all (covers: AC-7)", async () => {
        mockNoKeyFetch();
        seedHeuristicAnswer();
        useGraphStore.getState().setAnswerHighlight(["file:src/api.ts"]);
        useGraphStore.getState().setVisibleFileIds([]);
        render(<TracePanel />);

        fireEvent.click(screen.getByRole("button", { name: "Show all" }));

        expect(useGraphStore.getState().highlightSource).toBe("answer");
        expect(useGraphStore.getState().highlightedNodeIds).toEqual([
          "file:src/api.ts",
        ]);
      });
    });

    describe("prompt chip surface", () => {
      it("renders the chips with descriptions in the empty state and no compact row (covers: AC-11)", () => {
        mockNoKeyFetch();

        render(<TracePanel />);

        expect(
          screen.getByText(
            "Layer counts, strongest cross layer imports, and inverted dependencies",
          ),
        ).toBeInTheDocument();
        expect(
          screen.queryByRole("region", { name: "Suggested prompts" }),
        ).not.toBeInTheDocument();
      });

      it("moves the chips into a compact row once the thread has a message (covers: AC-11)", () => {
        mockNoKeyFetch();
        seedThread([userMessage("msg:u1", "Hello")]);

        render(<TracePanel />);

        const row = screen.getByRole("region", { name: "Suggested prompts" });
        expect(row).toBeInTheDocument();
        expect(
          screen.queryByText(
            "Layer counts, strongest cross layer imports, and inverted dependencies",
          ),
        ).not.toBeInTheDocument();
      });

      it("sends the chip prompt text to the selected provider and expects no highlight in BYOK mode (covers: AC-11)", async () => {
        const fetchMock = vi.fn().mockImplementation((url: string) => {
          if (url === "/api/ai/keys") {
            return Promise.resolve({
              ok: true,
              status: 200,
              json: async () => ({ hasKey: true, provider: "openai" }),
            } as unknown as Response);
          }
          return Promise.resolve(
            new Response(
              'data: {"type":"text","text":"Model answer text."}\n\ndata: {"type":"done"}\n\n',
              { status: 200 },
            ),
          );
        });
        global.fetch = fetchMock;
        render(<TracePanel />);
        await screen.findByText("OPENAI");

        fireEvent.click(
          screen.getByRole("button", { name: /State management flow/ }),
        );

        expect(
          await screen.findByText("Model answer text."),
        ).toBeInTheDocument();
        const queryCall = fetchMock.mock.calls.find(
          ([url]) => url === "/api/ai/query",
        );
        expect(queryCall).toBeDefined();
        const body = JSON.parse(queryCall![1].body as string);
        expect(body.isDemo).toBe(false);
        expect(body.provider).toBe("openai");
        expect(body.messages[body.messages.length - 1].content).toBe(
          "How does state management flow through this codebase?",
        );
        expect(useGraphStore.getState().highlightSource).toBeNull();
        expect(screen.queryByText(footerText)).not.toBeInTheDocument();
      });
    });

    it("finalizes a mid stream answer and drops the highlight when the repository changes (covers: AC-12)", async () => {
      mockNoKeyFetch();
      render(<TracePanel />);
      fireEvent.click(
        screen.getByRole("button", {
          name: /Core bottleneck \/ central files/,
        }),
      );
      await screen.findByText(/Core Central Files/, {}, { timeout: 5000 });
      expect(screen.getByTitle("Stop response")).toBeInTheDocument();

      act(() => {
        useGraphStore.getState().setGraph({
          ...mockGraph,
          repository: {
            ...mockRepo,
            id: "repo:other/lib",
            fullName: "other/lib",
          },
        } as unknown as CodebaseGraph);
      });

      await waitFor(() => {
        expect(screen.queryByTitle("Stop response")).not.toBeInTheDocument();
      });
      const saved = JSON.parse(
        sessionStorage.getItem("cv:thread:test/app") ?? "[]",
      ) as { role: string; status: string; content: string }[];
      const assistant = saved.filter((m) => m.role === "assistant");
      expect(assistant).toHaveLength(1);
      expect(assistant[0].status).toBe("complete");
      expect(assistant[0].content).toContain("Core Central Files");
      expect(saved.some((m) => m.status === "streaming")).toBe(false);
      expect(useGraphStore.getState().highlightSource).toBeNull();
      expect(useGraphStore.getState().highlightedNodeIds).toEqual([]);
    });

    it("finalizes an in flight assistant message and persists it when Stop response is clicked", async () => {
      mockNoKeyFetch();
      render(<TracePanel />);
      fireEvent.click(
        screen.getByRole("button", {
          name: /Core bottleneck \/ central files/,
        }),
      );
      await screen.findByText(/Core Central Files/, {}, { timeout: 5000 });
      const stopButton = screen.getByTitle("Stop response");
      expect(stopButton).toBeInTheDocument();

      fireEvent.click(stopButton);

      await waitFor(() => {
        expect(screen.queryByTitle("Stop response")).not.toBeInTheDocument();
      });

      const saved = JSON.parse(
        sessionStorage.getItem("cv:thread:test/app") ?? "[]",
      ) as { role: string; status: string; content: string }[];
      const assistant = saved.filter((m) => m.role === "assistant");
      expect(assistant).toHaveLength(1);
      expect(assistant[0].status).toBe("complete");
      expect(assistant[0].content).toContain("Core Central Files");
      expect(saved.some((m) => m.status === "streaming")).toBe(false);
    });

    it("does not write the old repository's mid stream thread into the new repository's storage (covers: AC-12)", async () => {
      mockNoKeyFetch();

      render(<TracePanel />);
      fireEvent.click(
        screen.getByRole("button", {
          name: /Core bottleneck \/ central files/,
        }),
      );
      await screen.findByText(/Core Central Files/, {}, { timeout: 5000 });

      act(() => {
        useGraphStore.getState().setGraph({
          ...mockGraph,
          repository: {
            ...mockRepo,
            id: "repo:other/lib",
            fullName: "other/lib",
          },
        } as unknown as CodebaseGraph);
      });
      await waitFor(() => {
        expect(screen.queryByTitle("Stop response")).not.toBeInTheDocument();
      });

      expect(
        screen.getByText("Ask Architectural Questions"),
      ).toBeInTheDocument();
      const otherThread = JSON.parse(
        sessionStorage.getItem("cv:thread:other/lib") ?? "[]",
      ) as unknown[];
      expect(otherThread).toEqual([]);
    });
  });
});
