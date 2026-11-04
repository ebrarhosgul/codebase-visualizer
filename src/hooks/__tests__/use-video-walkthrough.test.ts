import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useVideoWalkthrough } from "../use-video-walkthrough";
import {
  CURRENT_SCHEMA_VERSION,
  type CodebaseGraph,
  type FileNode,
} from "@/entities";
import type { AiQueryMessage } from "@/lib/ai/types";

function createMockFile(
  id: string,
  path: string,
  directoryId = "dir:src",
): FileNode {
  return {
    id,
    path,
    name: path.split("/").pop() ?? path,
    extension: ".ts",
    language: "typescript",
    sizeBytes: 100,
    lineCount: 20,
    directoryId,
    symbolIds: [],
    importIds: [],
    exportIds: [],
  };
}

function createMockGraph(repoName = "facebook/react"): CodebaseGraph {
  const [owner, name] = repoName.split("/");
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    repository: {
      id: `repo:${repoName}`,
      owner: owner || "facebook",
      name: name || "react",
      fullName: repoName,
      defaultBranch: "main",
      commitSha: "123456",
      analyzedAt: new Date().toISOString(),
      totalFiles: 2,
      totalSymbols: 0,
      languages: { TypeScript: 100 },
      schemaVersion: CURRENT_SCHEMA_VERSION,
    },
    files: {
      "file-1": createMockFile("file-1", "src/index.ts"),
      "file-2": createMockFile("file-2", "src/lib.ts"),
    },
    directories: {},
    symbols: {},
    externalModules: {},
    edges: {},
  };
}

describe("useVideoWalkthrough hook (AC-2, AC-3, AC-4, AC-5, AC-12)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockMessage: AiQueryMessage = {
    id: "msg-test-1",
    threadId: "thread-1",
    role: "assistant",
    content:
      "This is a detailed architectural answer explaining code structure.",
    status: "complete",
    citations: [],
    isPathVerified: true,
    createdAt: new Date().toISOString(),
  };

  it("resolves immediately with local demo walkthrough on facebook/react when no key is set (AC-3)", async () => {
    const onJobUpdate = vi.fn();
    const graph = createMockGraph("facebook/react");
    const fetchSpy = vi.spyOn(global, "fetch");

    const { result } = renderHook(() =>
      useVideoWalkthrough({
        repositoryFullName: "facebook/react",
        graph,
        hasVideoKey: false,
        onJobUpdate,
      }),
    );

    await act(async () => {
      await result.current.startWalkthrough(mockMessage);
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(onJobUpdate).toHaveBeenCalledWith(
      "msg-test-1",
      expect.objectContaining({
        status: "complete",
        providerId: "demo",
        videoUri: expect.stringMatching(/^(blob:|data:video\/)/),
      }),
    );
  });

  it("does not call /api/ai/video and renders auth notice on custom repositories with no key (AC-3)", async () => {
    const onJobUpdate = vi.fn();
    const onOpenKeySettings = vi.fn();
    const graph = createMockGraph("vercel/next.js");
    const fetchSpy = vi.spyOn(global, "fetch");

    const { result } = renderHook(() =>
      useVideoWalkthrough({
        repositoryFullName: "vercel/next.js",
        graph,
        hasVideoKey: false,
        onJobUpdate,
        onOpenKeySettings,
      }),
    );

    await act(async () => {
      await result.current.startWalkthrough(mockMessage);
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(onOpenKeySettings).toHaveBeenCalledWith("scrimba");
    expect(onJobUpdate).toHaveBeenCalledWith(
      "msg-test-1",
      expect.objectContaining({
        status: "failed",
        providerId: "scrimba",
        errorNotice: expect.objectContaining({
          code: "auth_error",
          suggestedAction: "open_keys",
        }),
      }),
    );
  });

  it("calls POST /api/ai/video when video key is configured and polls until complete (AC-4, AC-5)", async () => {
    vi.useFakeTimers();
    const onJobUpdate = vi.fn();
    const graph = createMockGraph("facebook/react");

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/ai/video/job-active-1")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            id: "job-active-1",
            status: "complete",
            videoUri: "https://cdn.scrimba.com/walkthrough.mp4",
            durationSeconds: 30,
            scenes: [],
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 202,
        json: async () => ({
          jobId: "job-active-1",
          status: "queued",
          durationSeconds: 30,
        }),
      });
    });

    const { result } = renderHook(() =>
      useVideoWalkthrough({
        repositoryFullName: "facebook/react",
        graph,
        hasVideoKey: true,
        onJobUpdate,
      }),
    );

    let promise: Promise<void>;
    act(() => {
      promise = result.current.startWalkthrough(mockMessage);
    });

    // Advance backoff timer (4000ms)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4500);
      await promise;
    });

    expect(onJobUpdate).toHaveBeenCalledWith(
      "msg-test-1",
      expect.objectContaining({
        status: "complete",
        videoUri: "https://cdn.scrimba.com/walkthrough.mp4",
      }),
    );
    vi.useRealTimers();
  });
});
