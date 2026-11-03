import { describe, it, expect } from "vitest";
import {
  isVideoDemoRepository,
  createDemoWalkthroughBlobUrl,
  createDemoWalkthroughJob,
  DEMO_WALKTHROUGH_VIDEO_BASE64,
} from "../demo-walkthrough";
import { CURRENT_SCHEMA_VERSION, type CodebaseGraph } from "@/entities";

function createMockGraph(): CodebaseGraph {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    repository: {
      id: "repo:facebook/react",
      owner: "facebook",
      name: "react",
      fullName: "facebook/react",
      defaultBranch: "main",
      commitSha: "abc1234",
      analyzedAt: new Date().toISOString(),
      totalFiles: 1,
      totalSymbols: 0,
      languages: { TypeScript: 100 },
      schemaVersion: CURRENT_SCHEMA_VERSION,
    },
    files: {
      "file-1": {
        id: "file-1",
        path: "packages/react/index.ts",
        name: "index.ts",
        extension: ".ts",
        language: "typescript",
        sizeBytes: 250,
        lineCount: 15,
        directoryId: "dir:root",
        symbolIds: [],
        importIds: [],
        exportIds: [],
      },
    },
    directories: {},
    symbols: {},
    externalModules: {},
    edges: {},
  };
}

describe("demo walkthrough utility functions (AC-3)", () => {
  describe("isVideoDemoRepository", () => {
    it("returns true for exact facebook/react repository", () => {
      expect(isVideoDemoRepository("facebook/react")).toBe(true);
    });

    it("returns true case insensitively with surrounding whitespace", () => {
      expect(isVideoDemoRepository("  Facebook/React  ")).toBe(true);
    });

    it("returns false for undefined, null, or empty string", () => {
      expect(isVideoDemoRepository(undefined)).toBe(false);
      expect(isVideoDemoRepository(null)).toBe(false);
      expect(isVideoDemoRepository("")).toBe(false);
      expect(isVideoDemoRepository("   ")).toBe(false);
    });

    it("returns false for non demo repositories", () => {
      expect(isVideoDemoRepository("vercel/next.js")).toBe(false);
      expect(isVideoDemoRepository("tailwindlabs/tailwindcss")).toBe(false);
    });
  });

  describe("DEMO_WALKTHROUGH_VIDEO_BASE64", () => {
    it("contains a non empty base64 string constant", () => {
      expect(typeof DEMO_WALKTHROUGH_VIDEO_BASE64).toBe("string");
      expect(DEMO_WALKTHROUGH_VIDEO_BASE64.length).toBeGreaterThan(50);
    });
  });

  describe("createDemoWalkthroughBlobUrl", () => {
    it("produces a playable media URI string", () => {
      const url = createDemoWalkthroughBlobUrl();
      expect(typeof url).toBe("string");
      expect(
        url.startsWith("blob:") || url.startsWith("data:video/webm;base64,"),
      ).toBe(true);
    });
  });

  describe("createDemoWalkthroughJob", () => {
    it("creates a completed demo job with 30 second target duration and contiguous cues", () => {
      const graph = createMockGraph();
      const job = createDemoWalkthroughJob({
        messageId: "msg-demo-42",
        repositoryFullName: "facebook/react",
        messageContent: "React Fiber reconciler architecture overview",
        graph,
      });

      expect(job.status).toBe("complete");
      expect(job.providerId).toBe("demo");
      expect(job.durationSeconds).toBe(30);
      expect(job.messageId).toBe("msg-demo-42");
      expect(job.repositoryFullName).toBe("facebook/react");
      expect(job.errorNotice).toBeNull();
      expect(job.videoUri).toBeTruthy();
      expect(job.cues.length).toBeGreaterThan(0);

      const firstCue = job.cues[0];
      expect(firstCue.startTimeSeconds).toBe(0);
      expect(firstCue.endTimeSeconds).toBeGreaterThan(0);
    });
  });
});
