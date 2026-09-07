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
});
