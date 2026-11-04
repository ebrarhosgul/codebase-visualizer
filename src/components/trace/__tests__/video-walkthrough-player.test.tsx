import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { VideoWalkthroughPlayer } from "../video-walkthrough-player";
import type { VideoWalkthroughJob } from "@/lib/ai/video/types";
import { useGraphStore } from "@/stores/graph-store";

describe("VideoWalkthroughPlayer component (AC-7, AC-8, AC-9, AC-10)", () => {
  const mockJob: VideoWalkthroughJob = {
    jobId: "job-player-test",
    messageId: "msg-123",
    repositoryFullName: "facebook/react",
    status: "complete",
    providerId: "demo",
    videoUri: "blob:http://localhost:3000/demo-video-blob",
    durationSeconds: 30,
    cues: [
      {
        cueId: "c1",
        index: 0,
        startTimeSeconds: 0,
        endTimeSeconds: 10,
        title: "Chapter 1: Entry",
        narration: "Entry point explanation",
        nodeIds: ["node-1"],
        edgeIds: ["edge-1"],
        focalNodeId: "node-1",
      },
      {
        cueId: "c2",
        index: 1,
        startTimeSeconds: 10,
        endTimeSeconds: 20,
        title: "Chapter 2: Processing",
        narration: "Core processing logic",
        nodeIds: ["node-2"],
        edgeIds: ["edge-2"],
        focalNodeId: "node-2",
      },
      {
        cueId: "c3",
        index: 2,
        startTimeSeconds: 20,
        endTimeSeconds: 30,
        title: "Chapter 3: Output",
        narration: "Final output layer",
        nodeIds: ["node-3"],
        edgeIds: [],
        focalNodeId: "node-3",
      },
    ],
    errorNotice: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    useGraphStore.setState({
      highlightSource: null,
      highlightedNodeIds: [],
      highlightedEdgeIds: [],
      videoFocalNodeId: null,
      isVideoAutoPanEnabled: true,
    });
  });

  it("renders native HTML5 video element initialized paused at 0:00 (AC-7)", () => {
    render(<VideoWalkthroughPlayer job={mockJob} />);

    const videoEl = screen.getByTestId(
      "walkthrough-video-element",
    ) as HTMLVideoElement;
    expect(videoEl).toBeInTheDocument();
    expect(videoEl.paused).toBe(true);
    expect(screen.getByTestId("play-pause-btn")).toBeInTheDocument();
    expect(screen.getByTestId("active-cue-caption")).toHaveTextContent(
      "Chapter 1: Entry",
    );
  });

  it("dispatches setVideoCueHighlight only on discrete cue transitions during time updates (AC-8)", () => {
    const setHighlightSpy = vi.spyOn(
      useGraphStore.getState(),
      "setVideoCueHighlight",
    );

    render(<VideoWalkthroughPlayer job={mockJob} />);
    const videoEl = screen.getByTestId(
      "walkthrough-video-element",
    ) as HTMLVideoElement;

    // Time update within cue 0 (0..10)
    videoEl.currentTime = 2.0;
    fireEvent.timeUpdate(videoEl);
    videoEl.currentTime = 4.0;
    fireEvent.timeUpdate(videoEl);
    expect(setHighlightSpy).not.toHaveBeenCalled();

    // Time update transitions to cue 1 (10..20)
    videoEl.currentTime = 12.0;
    fireEvent.timeUpdate(videoEl);
    expect(setHighlightSpy).toHaveBeenCalledTimes(1);
    expect(setHighlightSpy).toHaveBeenCalledWith({
      nodeIds: ["node-2"],
      edgeIds: ["edge-2"],
      focalNodeId: "node-2",
    });

    // Another update in cue 1 should not re trigger store
    videoEl.currentTime = 14.0;
    fireEvent.timeUpdate(videoEl);
    expect(setHighlightSpy).toHaveBeenCalledTimes(1);
  });

  it("seeks video and highlights node on chapter cue click", () => {
    render(<VideoWalkthroughPlayer job={mockJob} />);
    const chapterBtn = screen.getByTestId("chapter-cue-1");

    fireEvent.click(chapterBtn);

    const videoEl = screen.getByTestId(
      "walkthrough-video-element",
    ) as HTMLVideoElement;
    expect(videoEl.currentTime).toBe(10);
    expect(useGraphStore.getState().highlightSource).toBe("video");
    expect(useGraphStore.getState().videoFocalNodeId).toBe("node-2");
  });

  it("displays Resume sync button when canvas auto pan is paused (AC-9)", () => {
    useGraphStore.setState({
      highlightSource: "video",
      isVideoAutoPanEnabled: false,
    });

    render(<VideoWalkthroughPlayer job={mockJob} />);

    const resumeBtn = screen.getByTestId("resume-sync-btn");
    expect(resumeBtn).toBeInTheDocument();

    fireEvent.click(resumeBtn);
    expect(useGraphStore.getState().isVideoAutoPanEnabled).toBe(true);
  });

  it("displays hidden cue nodes banner and triggers onShowAllNodes (AC-10)", () => {
    const onShowAllNodes = vi.fn();
    render(
      <VideoWalkthroughPlayer
        job={mockJob}
        hiddenCueNodeCount={3}
        onShowAllNodes={onShowAllNodes}
      />,
    );

    expect(
      screen.getByText("3 cue nodes hidden by current filters"),
    ).toBeInTheDocument();

    const showAllBtn = screen.getByTestId("show-all-cue-nodes-btn");
    fireEvent.click(showAllBtn);
    expect(onShowAllNodes).toHaveBeenCalled();
  });

  it("dynamically recomputes hidden cue node count when switching active chapters", () => {
    // Only node-1 is visible; node-2 and node-3 are hidden by filters
    useGraphStore.setState({
      highlightSource: "video",
      visibleFileIds: ["node-1"],
      isCalculatingLayout: false,
      graph: {
        schemaVersion: 1,
        repository: {
          id: "repo:1",
          owner: "facebook",
          name: "react",
          fullName: "facebook/react",
          defaultBranch: "main",
          commitSha: "abc",
          analyzedAt: new Date().toISOString(),
          totalFiles: 3,
          totalSymbols: 0,
          languages: {},
          schemaVersion: 1,
        },
        files: {
          "node-1": {
            id: "node-1",
            path: "src/node-1.ts",
            name: "node-1.ts",
            extension: ".ts",
            language: "typescript",
            sizeBytes: 100,
            lineCount: 10,
            directoryId: "d1",
            symbolIds: [],
            importIds: [],
            exportIds: [],
          },
          "node-2": {
            id: "node-2",
            path: "src/node-2.ts",
            name: "node-2.ts",
            extension: ".ts",
            language: "typescript",
            sizeBytes: 100,
            lineCount: 10,
            directoryId: "d1",
            symbolIds: [],
            importIds: [],
            exportIds: [],
          },
          "node-3": {
            id: "node-3",
            path: "src/node-3.ts",
            name: "node-3.ts",
            extension: ".ts",
            language: "typescript",
            sizeBytes: 100,
            lineCount: 10,
            directoryId: "d1",
            symbolIds: [],
            importIds: [],
            exportIds: [],
          },
        },
        directories: {},
        symbols: {},
        externalModules: {},
        edges: {},
      },
    });

    render(<VideoWalkthroughPlayer job={mockJob} />);

    // At chapter 0 (node-1), node-1 is visible so no hidden notice is displayed
    expect(
      screen.queryByTestId("hidden-cue-nodes-banner"),
    ).not.toBeInTheDocument();

    // Click Chapter 2 (idx 1 with node-2)
    const chapter2Btn = screen.getByTestId("chapter-cue-1");
    fireEvent.click(chapter2Btn);

    // Now chapter 1 is active with node-2, which is hidden
    expect(screen.getByTestId("hidden-cue-nodes-banner")).toBeInTheDocument();
    expect(
      screen.getByText("1 cue node hidden by current filters"),
    ).toBeInTheDocument();
  });
});
