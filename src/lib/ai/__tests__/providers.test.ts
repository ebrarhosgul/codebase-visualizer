import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { CodebaseGraph, Repository } from "@/entities";
import { getAIProvider } from "../provider-registry";
import { DemoAIProvider } from "../demo-provider";
import { GeminiAIProvider } from "../gemini-provider";
import { OpenAIProvider } from "../openai-provider";
import { ClaudeProvider } from "../claude-provider";

describe("AI Providers and Registry", () => {
  const mockRepo: Repository = {
    id: "repo:test/app",
    owner: "test",
    name: "app",
    fullName: "test/app",
    defaultBranch: "main",
    commitSha: "123456",
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
      "file:src/app.ts": {
        id: "file:src/app.ts",
        path: "src/app.ts",
        name: "app.ts",
        directoryId: "dir:src",
        extension: "ts",
        lineCount: 10,
        characterCount: 100,
        symbolIds: [],
        outgoingImportFileIds: ["file:src/utils.ts"],
      },
      "file:src/utils.ts": {
        id: "file:src/utils.ts",
        path: "src/utils.ts",
        name: "utils.ts",
        directoryId: "dir:src",
        extension: "ts",
        lineCount: 15,
        characterCount: 150,
        symbolIds: [],
        outgoingImportFileIds: [],
      },
    },
    symbols: {},
    externalModules: {},
    edges: {
      "edge:app->utils": {
        id: "edge:app->utils",
        sourceId: "file:src/app.ts",
        targetId: "file:src/utils.ts",
        kind: "file_import",
      },
    },
  } as unknown as CodebaseGraph;

  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns DemoAIProvider when isDemo is true (covers: AC-2)", () => {
    const provider = getAIProvider("gemini", true);
    expect(provider.id).toBe("demo");
    expect(provider.name).toContain("Demo");
  });

  it("returns GeminiAIProvider by default for non demo (covers: AC-3)", () => {
    const provider = getAIProvider("gemini", false);
    expect(provider.id).toBe("gemini");
  });

  it("returns OpenAIProvider and ClaudeProvider when selected (covers: AC-3)", () => {
    expect(getAIProvider("openai", false).id).toBe("openai");
    expect(getAIProvider("claude", false).id).toBe("claude");
  });

  it("falls back to Gemini provider for unknown provider string (covers: AC-3)", () => {
    expect(getAIProvider("unsupported" as unknown as "gemini", false).id).toBe(
      "gemini",
    );
  });

  describe("DemoAIProvider", () => {
    it("streams answers and path trace for path query (covers: AC-2, AC-4)", async () => {
      const provider = new DemoAIProvider();
      const generator = provider.streamQuery(
        [{ role: "user", content: "Trace path between app.ts and utils.ts" }],
        {
          repository: mockRepo,
          graph: mockGraph,
          contextSummary: "app.ts imports utils.ts",
        },
      );

      const events = [];
      for await (const event of generator) {
        events.push(event);
      }

      const textEvents = events.filter((e) => e.type === "text");
      const traceEvents = events.filter((e) => e.type === "trace");
      const citationEvents = events.filter((e) => e.type === "citations");
      const doneEvents = events.filter((e) => e.type === "done");

      expect(textEvents.length).toBeGreaterThan(0);
      expect(traceEvents).toHaveLength(1);
      expect(
        traceEvents[0].type === "trace" && traceEvents[0].trace.hopCount,
      ).toBe(1);
      expect(citationEvents.length).toBeGreaterThan(0);
      expect(doneEvents).toHaveLength(1);
    });

    it("streams architectural layer breakdown for layer queries (covers: AC-2)", async () => {
      const provider = new DemoAIProvider();
      const generator = provider.streamQuery(
        [
          {
            role: "user",
            content: "What is the architectural layer structure?",
          },
        ],
        {
          repository: mockRepo,
          graph: mockGraph,
          contextSummary: "Layer summary",
        },
      );

      const events = [];
      for await (const event of generator) {
        events.push(event);
      }

      const textEvents = events.filter((e) => e.type === "text");
      const doneEvents = events.filter((e) => e.type === "done");
      expect(textEvents.length).toBeGreaterThan(0);
      expect(doneEvents).toHaveLength(1);
    });

    it("streams separation notice and warning for disconnected files (covers: AC-7)", async () => {
      const disconnectedGraph = {
        ...mockGraph,
        edges: {}, // No edges
      } as unknown as CodebaseGraph;

      const provider = new DemoAIProvider();
      const generator = provider.streamQuery(
        [{ role: "user", content: "Connect app.ts and utils.ts" }],
        {
          repository: mockRepo,
          graph: disconnectedGraph,
          contextSummary: "No connection",
        },
      );

      const events = [];
      for await (const event of generator) {
        events.push(event);
      }

      const warningEvents = events.filter((e) => e.type === "warning");
      const textEvents = events.filter((e) => e.type === "text");
      expect(warningEvents.length).toBe(1);
      expect(
        textEvents.some(
          (t) => t.type === "text" && t.text.includes("Separation"),
        ),
      ).toBe(true);
    });

    it("halts demo streaming when abort signal is triggered (covers: AC-1)", async () => {
      const provider = new DemoAIProvider();
      const controller = new AbortController();
      controller.abort();

      const generator = provider.streamQuery(
        [{ role: "user", content: "General overview" }],
        {
          repository: mockRepo,
          graph: mockGraph,
          contextSummary: "Summary",
        },
        undefined,
        controller.signal,
      );

      const events = [];
      for await (const event of generator) {
        events.push(event);
      }
      expect(events.length).toBe(0);
    });
  });

  describe("GeminiAIProvider", () => {
    it("yields error event when API key is missing (covers: AC-3)", async () => {
      const originalKey = process.env.GEMINI_API_KEY;
      delete process.env.GEMINI_API_KEY;

      try {
        const provider = new GeminiAIProvider();
        const generator = provider.streamQuery(
          [{ role: "user", content: "Hello" }],
          {
            repository: mockRepo,
            graph: mockGraph,
            contextSummary: "Summary",
          },
        );

        const events = [];
        for await (const event of generator) {
          events.push(event);
        }

        expect(events).toHaveLength(1);
        expect(events[0].type).toBe("error");
        if (events[0].type === "error") {
          expect(events[0].error).toContain("Missing Gemini API key");
        }
      } finally {
        if (originalKey) process.env.GEMINI_API_KEY = originalKey;
      }
    });

    it("streams text and extracts citations and trace on valid response (covers: AC-3)", async () => {
      const sseBody = [
        'data: {"candidates":[{"content":{"parts":[{"text":"app.ts imports utils.ts directly."}]}}]}\n\n',
      ].join("");

      global.fetch = vi.fn().mockResolvedValue(
        new Response(sseBody, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }),
      );

      const provider = new GeminiAIProvider();
      const generator = provider.streamQuery(
        [{ role: "user", content: "How do they connect?" }],
        {
          repository: mockRepo,
          graph: mockGraph,
          contextSummary: "Summary",
        },
        "mock-key",
      );

      const events = [];
      for await (const event of generator) {
        events.push(event);
      }

      const textEvents = events.filter((e) => e.type === "text");
      const citationEvents = events.filter((e) => e.type === "citations");
      const traceEvents = events.filter((e) => e.type === "trace");
      const doneEvents = events.filter((e) => e.type === "done");

      expect(textEvents.length).toBeGreaterThan(0);
      expect(citationEvents.length).toBeGreaterThan(0);
      expect(traceEvents.length).toBe(1);
      expect(doneEvents.length).toBe(1);
    });

    it("yields error event when Gemini returns non 200 status (covers: AC-3)", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValue(new Response("Quota exceeded", { status: 429 }));

      const provider = new GeminiAIProvider();
      const generator = provider.streamQuery(
        [{ role: "user", content: "Hello" }],
        {
          repository: mockRepo,
          graph: mockGraph,
          contextSummary: "Summary",
        },
        "mock-key",
      );

      const events = [];
      for await (const event of generator) {
        events.push(event);
      }

      expect(events[0].type).toBe("error");
      if (events[0].type === "error") {
        expect(events[0].error).toContain("429");
      }
    });
  });

  describe("OpenAIProvider", () => {
    it("yields error event when API key is missing (covers: AC-3)", async () => {
      const originalKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      try {
        const provider = new OpenAIProvider();
        const generator = provider.streamQuery(
          [{ role: "user", content: "Hello" }],
          {
            repository: mockRepo,
            graph: mockGraph,
            contextSummary: "Summary",
          },
        );

        const events = [];
        for await (const event of generator) {
          events.push(event);
        }

        expect(events[0].type).toBe("error");
        if (events[0].type === "error") {
          expect(events[0].error).toContain("Missing OpenAI API key");
        }
      } finally {
        if (originalKey) process.env.OPENAI_API_KEY = originalKey;
      }
    });

    it("streams text and ignores DONE marker (covers: AC-3)", async () => {
      const sseBody = [
        'data: {"choices":[{"delta":{"content":"app.ts and utils.ts connect."}}]}\n\n',
        "data: [DONE]\n\n",
      ].join("");

      global.fetch = vi.fn().mockResolvedValue(
        new Response(sseBody, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }),
      );

      const provider = new OpenAIProvider();
      const generator = provider.streamQuery(
        [{ role: "user", content: "Trace connection" }],
        {
          repository: mockRepo,
          graph: mockGraph,
          contextSummary: "Summary",
        },
        "mock-key",
      );

      const events = [];
      for await (const event of generator) {
        events.push(event);
      }

      const textEvents = events.filter((e) => e.type === "text");
      const doneEvents = events.filter((e) => e.type === "done");
      expect(textEvents.length).toBeGreaterThan(0);
      expect(doneEvents.length).toBe(1);
    });
  });

  describe("ClaudeProvider", () => {
    it("yields error event when API key is missing (covers: AC-3)", async () => {
      const originalKey = process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      try {
        const provider = new ClaudeProvider();
        const generator = provider.streamQuery(
          [{ role: "user", content: "Hello" }],
          {
            repository: mockRepo,
            graph: mockGraph,
            contextSummary: "Summary",
          },
        );

        const events = [];
        for await (const event of generator) {
          events.push(event);
        }

        expect(events[0].type).toBe("error");
        if (events[0].type === "error") {
          expect(events[0].error).toContain("Missing Anthropic API key");
        }
      } finally {
        if (originalKey) process.env.ANTHROPIC_API_KEY = originalKey;
      }
    });

    it("streams content block deltas and completes (covers: AC-3)", async () => {
      const sseBody = [
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"app.ts calls utils.ts."}}\n\n',
      ].join("");

      global.fetch = vi.fn().mockResolvedValue(
        new Response(sseBody, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }),
      );

      const provider = new ClaudeProvider();
      const generator = provider.streamQuery(
        [{ role: "user", content: "Trace flow" }],
        {
          repository: mockRepo,
          graph: mockGraph,
          contextSummary: "Summary",
        },
        "mock-key",
      );

      const events = [];
      for await (const event of generator) {
        events.push(event);
      }

      const textEvents = events.filter((e) => e.type === "text");
      const doneEvents = events.filter((e) => e.type === "done");
      expect(textEvents.length).toBeGreaterThan(0);
      expect(doneEvents.length).toBe(1);
    });
  });
});
