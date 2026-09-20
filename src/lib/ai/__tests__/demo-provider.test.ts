import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  CURRENT_SCHEMA_VERSION,
  createGraphEdge,
  type CodebaseGraph,
  type FileNode,
  type GraphEdge,
} from "@/entities";
import { DemoAIProvider } from "../demo-provider";
import { chunkMarkdown } from "../demo/chunker";
import type { AIRequestContext, AIStreamEvent } from "../types";

const mockRepo = {
  id: "repo:test-owner/test-repo",
  owner: "test-owner",
  name: "test-repo",
  fullName: "test-owner/test-repo",
  defaultBranch: "main",
  commitSha: "123456",
  analyzedAt: "2026-09-02T19:00:00.000Z",
  totalFiles: 4,
  totalSymbols: 0,
  languages: { TypeScript: 100 },
  schemaVersion: CURRENT_SCHEMA_VERSION,
};

function createMockFile(id: string, path: string): FileNode {
  return {
    id,
    path,
    name: path.split("/").pop() ?? path,
    extension: ".ts",
    language: "typescript",
    sizeBytes: 100,
    lineCount: 20,
    directoryId: "dir:src",
    symbolIds: [],
    importIds: [],
    exportIds: [],
  };
}

function createMockEdge(sourceId: string, targetId: string): GraphEdge {
  return createGraphEdge({
    sourceId,
    targetId,
    kind: "file_import",
    isExternal: false,
  });
}

function createContext(
  files: Record<string, FileNode>,
  edges: Record<string, GraphEdge> = {},
): AIRequestContext {
  const graph: CodebaseGraph = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    repository: mockRepo,
    files,
    edges,
    directories: {},
    symbols: {},
    externalModules: {},
  };
  return { repository: mockRepo, graph, contextSummary: "Summary" };
}

/** Graph where `src/api/client.ts` is imported by three components. */
const connectedContext = createContext(
  {
    "file:api": createMockFile("file:api", "src/api/client.ts"),
    "file:a": createMockFile("file:a", "src/components/A.tsx"),
    "file:b": createMockFile("file:b", "src/components/B.tsx"),
    "file:c": createMockFile("file:c", "src/components/C.tsx"),
  },
  {
    e1: createMockEdge("file:a", "file:api"),
    e2: createMockEdge("file:b", "file:api"),
    e3: createMockEdge("file:c", "file:api"),
  },
);

/**
 * Path trace picks source and target in graph file order, so the importing
 * file is listed first to give a directed path from `A.tsx` to `client.ts`.
 */
const pathContext = createContext(
  {
    "file:a": createMockFile("file:a", "src/components/A.tsx"),
    "file:api": createMockFile("file:api", "src/api/client.ts"),
  },
  { e1: createMockEdge("file:a", "file:api") },
);

/** Graph with files but no internal edges, so answers fall back. */
const edgelessContext = createContext({
  "file:one": createMockFile("file:one", "src/one.ts"),
  "file:two": createMockFile("file:two", "src/two.ts"),
});

const userMessage = (content: string) =>
  [{ role: "user" as const, content }] as const;

/** Consumes the generator while advancing fake timers so the 30 ms sleeps resolve. */
async function collect(
  generator: AsyncGenerator<AIStreamEvent, void, unknown>,
): Promise<AIStreamEvent[]> {
  const events: AIStreamEvent[] = [];
  const consumer = (async () => {
    for await (const event of generator) {
      events.push(event);
    }
  })();
  await vi.runAllTimersAsync();
  await consumer;
  return events;
}

describe("DemoAIProvider (0013 zero friction demo mode)", () => {
  const provider = new DemoAIProvider();

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("streams text, then citations, then one highlight, then done for a central files answer (covers: AC-1, AC-6)", async () => {
    const events = await collect(
      provider.streamQuery(
        userMessage("Which files are the core bottlenecks?"),
        connectedContext,
      ),
    );

    const types = events.map((e) => e.type);
    const firstNonText = types.findIndex((t) => t !== "text");
    expect(firstNonText).toBeGreaterThan(0);
    expect(types.slice(0, firstNonText).every((t) => t === "text")).toBe(true);
    expect(types.slice(firstNonText)).toEqual([
      "citations",
      "highlight",
      "done",
    ]);
  });

  it("makes zero network requests while streaming a demo answer (covers: AC-1)", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await collect(
      provider.streamQuery(
        userMessage("Which files are the core bottlenecks?"),
        connectedContext,
      ),
    );

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("emits a highlight whose node ids equal the cited file ids in order (covers: AC-6)", async () => {
    const events = await collect(
      provider.streamQuery(
        userMessage("Which files are the core bottlenecks?"),
        connectedContext,
      ),
    );

    const citations = events.find((e) => e.type === "citations");
    const highlight = events.find((e) => e.type === "highlight");
    expect(citations?.type).toBe("citations");
    expect(highlight?.type).toBe("highlight");
    if (citations?.type === "citations" && highlight?.type === "highlight") {
      expect(highlight.nodeIds).toEqual(
        citations.citations.map((c) => c.fileId),
      );
      expect(highlight.nodeIds[0]).toBe("file:api");
      expect(highlight.nodeIds.length).toBeLessThanOrEqual(8);
    }
  });

  it("emits exactly one highlight event per answer (covers: AC-6)", async () => {
    const events = await collect(
      provider.streamQuery(
        userMessage("Which files are the core bottlenecks?"),
        connectedContext,
      ),
    );

    expect(events.filter((e) => e.type === "highlight")).toHaveLength(1);
  });

  it("joins streamed text chunks back into the full computed answer (covers: AC-5)", async () => {
    const events = await collect(
      provider.streamQuery(
        userMessage("Which files are the core bottlenecks?"),
        connectedContext,
      ),
    );

    const streamed = events
      .filter((e) => e.type === "text")
      .map((e) => (e.type === "text" ? e.text : ""))
      .join("");
    expect(streamed).toContain("Core Central Files for `test-owner/test-repo`");
    expect(streamed).toContain("src/api/client.ts");
    expect(chunkMarkdown(streamed).join("")).toBe(streamed);
  });

  it("spaces text chunks 30 ms apart (covers: AC-5)", async () => {
    const generator = provider.streamQuery(
      userMessage("Which files are the core bottlenecks?"),
      connectedContext,
    );

    const first = await generator.next();
    expect(first.value?.type).toBe("text");

    // The second chunk must not arrive until 30 ms of sleep has elapsed.
    let secondArrived = false;
    const second = generator.next().then((r) => {
      secondArrived = true;
      return r;
    });
    await vi.advanceTimersByTimeAsync(29);
    expect(secondArrived).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect((await second).value?.type).toBe("text");
    expect(secondArrived).toBe(true);

    await generator.return(undefined);
  });

  it("emits no highlight or citations for a fallback answer with no internal edges (covers: AC-6, AC-10)", async () => {
    const events = await collect(
      provider.streamQuery(
        userMessage("Which files are the core bottlenecks?"),
        edgelessContext,
      ),
    );

    const types = events.map((e) => e.type);
    expect(types).not.toContain("highlight");
    expect(types).not.toContain("citations");
    expect(types[types.length - 1]).toBe("done");
    const text = events.map((e) => (e.type === "text" ? e.text : "")).join("");
    expect(text).toContain("no internal import edges detected");
  });

  it("emits a trace but no highlight for a path trace answer (covers: AC-6, AC-9)", async () => {
    const events = await collect(
      provider.streamQuery(
        userMessage("Trace path from A.tsx to client.ts"),
        pathContext,
      ),
    );

    const types = events.map((e) => e.type);
    expect(types).toContain("trace");
    expect(types).not.toContain("highlight");
    expect(types[types.length - 1]).toBe("done");
  });

  it("uses an explicit intent hint over what the prompt keywords say (covers: AC-9)", async () => {
    const events = await collect(
      provider.streamQuery(
        userMessage("Which files are the core bottlenecks?"),
        connectedContext,
        undefined,
        undefined,
        { intent: "layer_breakdown" },
      ),
    );

    const text = events.map((e) => (e.type === "text" ? e.text : "")).join("");
    expect(text).not.toContain("Core Central Files");
    expect(text).toMatch(/layer/i);
  });

  it("answers the most recent user message when the thread has several (covers: AC-9)", async () => {
    const events = await collect(
      provider.streamQuery(
        [
          { role: "user", content: "Show me the architecture layers" },
          { role: "assistant", content: "Earlier answer" },
          { role: "user", content: "Which files are the core bottlenecks?" },
        ],
        connectedContext,
      ),
    );

    const text = events.map((e) => (e.type === "text" ? e.text : "")).join("");
    expect(text).toContain("Core Central Files");
  });

  it("streams a repository overview for a prompt that matches no keyword (covers: AC-9)", async () => {
    const events = await collect(
      provider.streamQuery(userMessage("hello there"), connectedContext),
    );

    const types = events.map((e) => e.type);
    expect(types[0]).toBe("text");
    expect(types[types.length - 1]).toBe("done");
  });

  it("streams an overview without throwing when the thread has no user message (covers: AC-9)", async () => {
    const events = await collect(provider.streamQuery([], connectedContext));

    expect(events[events.length - 1]?.type).toBe("done");
  });

  it("stops emitting when the signal is aborted mid stream (covers: AC-12)", async () => {
    const controller = new AbortController();
    const generator = provider.streamQuery(
      userMessage("Which files are the core bottlenecks?"),
      connectedContext,
      undefined,
      controller.signal,
    );

    const events: AIStreamEvent[] = [];
    const consumer = (async () => {
      for await (const event of generator) {
        events.push(event);
        if (events.length === 2) controller.abort();
      }
    })();
    await vi.runAllTimersAsync();
    await consumer;

    const types = events.map((e) => e.type);
    expect(types.length).toBeLessThanOrEqual(3);
    expect(types).not.toContain("highlight");
    expect(types).not.toContain("citations");
    expect(types).not.toContain("done");
  });

  it("emits nothing when the signal is already aborted (covers: AC-12)", async () => {
    const controller = new AbortController();
    controller.abort();

    const events = await collect(
      provider.streamQuery(
        userMessage("Which files are the core bottlenecks?"),
        connectedContext,
        undefined,
        controller.signal,
      ),
    );

    expect(events).toEqual([]);
  });
});
