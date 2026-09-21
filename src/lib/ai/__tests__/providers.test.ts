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

  describe("server side API keys are never used", () => {
    const ctx = () => ({
      repository: mockRepo,
      graph: mockGraph,
      contextSummary: "Summary",
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it.each([
      ["gemini", "GEMINI_API_KEY", () => new GeminiAIProvider()],
      ["openai", "OPENAI_API_KEY", () => new OpenAIProvider()],
      ["claude", "ANTHROPIC_API_KEY", () => new ClaudeProvider()],
    ] as const)(
      "%s provider ignores %s and errors without a caller key",
      async (_name, envName, makeProvider) => {
        vi.stubEnv(envName, "server-operator-key-must-not-be-used");
        global.fetch = vi.fn();

        const events = [];
        for await (const event of makeProvider().streamQuery(
          [{ role: "user", content: "Hello" }],
          ctx(),
        )) {
          events.push(event);
        }

        expect(events).toHaveLength(1);
        expect(events[0].type).toBe("error");
        expect(global.fetch).not.toHaveBeenCalled();
      },
    );

    it("sends the Gemini key in a header instead of the URL", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValue(
          new Response(
            'data: {"candidates":[{"content":{"parts":[{"text":"hi"}]}}]}\n\n',
            { status: 200 },
          ),
        );

      const events = [];
      for await (const event of new GeminiAIProvider().streamQuery(
        [{ role: "user", content: "Hello" }],
        ctx(),
        "caller-gemini-key",
      )) {
        events.push(event);
      }

      const [url, init] = vi.mocked(global.fetch).mock.calls[0] as [
        string,
        RequestInit,
      ];
      expect(url).not.toContain("caller-gemini-key");
      expect(url).not.toContain("key=");
      expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe(
        "caller-gemini-key",
      );
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
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(
          "models/gemini-3.6-flash:streamGenerateContent",
        ),
        expect.any(Object),
      );
    });

    it("respects GEMINI_MODEL environment variable override", async () => {
      const originalModel = process.env.GEMINI_MODEL;
      process.env.GEMINI_MODEL = "models/gemini-3.5-flash";

      try {
        global.fetch = vi.fn().mockResolvedValue(
          new Response(
            'data: {"candidates":[{"content":{"parts":[{"text":"ok"}]}}]}\n\n',
            {
              status: 200,
              headers: { "Content-Type": "text/event-stream" },
            },
          ),
        );

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

        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining(
            "models/gemini-3.5-flash:streamGenerateContent",
          ),
          expect.any(Object),
        );
      } finally {
        if (originalModel === undefined) {
          delete process.env.GEMINI_MODEL;
        } else {
          process.env.GEMINI_MODEL = originalModel;
        }
      }
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

    it("parses structured JSON error messages from Gemini API", async () => {
      const errorJson = JSON.stringify({
        error: {
          code: 404,
          message: "This model models/gemini-2.0-flash is no longer available.",
          status: "NOT_FOUND",
        },
      });

      global.fetch = vi.fn().mockResolvedValue(
        new Response(errorJson, {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }),
      );

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
        expect(events[0].error).toBe(
          "Gemini API returned HTTP 404: This model models/gemini-2.0-flash is no longer available.",
        );
      }
    });

    it("strips trailing assistant turns and empty turns to avoid requests ending with model turn", async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(
          'data: {"candidates":[{"content":{"parts":[{"text":"answer"}]}}]}\n\n',
          {
            status: 200,
            headers: { "Content-Type": "text/event-stream" },
          },
        ),
      );

      const provider = new GeminiAIProvider();
      const generator = provider.streamQuery(
        [
          { role: "user", content: "Initial query" },
          { role: "assistant", content: "Previous reply" },
          { role: "user", content: "Follow up question" },
          { role: "assistant", content: "" }, // empty pending assistant turn
        ],
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

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const callArgs = (global.fetch as unknown as ReturnType<typeof vi.fn>)
        .mock.calls[0];
      const requestBody = JSON.parse(callArgs[1].body as string) as {
        contents: Array<{ role: string; parts: Array<{ text: string }> }>;
      };

      // Last item in contents must be user, not model
      const lastContent = requestBody.contents[requestBody.contents.length - 1];
      expect(lastContent.role).toBe("user");
      expect(lastContent.parts[0].text).toBe("Follow up question");
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
