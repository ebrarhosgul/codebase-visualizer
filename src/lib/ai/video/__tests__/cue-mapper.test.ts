import { describe, it, expect } from "vitest";
import {
  CURRENT_SCHEMA_VERSION,
  createGraphEdge,
  type CodebaseGraph,
  type FileNode,
} from "@/entities";
import { buildValidatedVideoCues, findActiveCueIndex } from "../cue-mapper";
import type { VideoTimelineCue } from "../types";

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

function createMockGraph(): CodebaseGraph {
  const edge1 = createGraphEdge({
    sourceId: "file-1",
    targetId: "file-2",
    kind: "file_import",
  });
  const edge2 = createGraphEdge({
    sourceId: "file-2",
    targetId: "file-3",
    kind: "file_import",
  });

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    repository: {
      id: "repo:facebook/react",
      owner: "facebook",
      name: "react",
      fullName: "facebook/react",
      defaultBranch: "main",
      commitSha: "123456",
      analyzedAt: new Date().toISOString(),
      totalFiles: 3,
      totalSymbols: 0,
      languages: { TypeScript: 100 },
      schemaVersion: CURRENT_SCHEMA_VERSION,
    },
    files: {
      "file-1": createMockFile("file-1", "src/index.ts", "dir:1"),
      "file-2": createMockFile("file-2", "src/lib/parser.ts", "dir:2"),
      "file-3": createMockFile("file-3", "src/lib/types.ts", "dir:2"),
    },
    directories: {},
    symbols: {},
    externalModules: {},
    edges: {
      [edge1.id]: edge1,
      [edge2.id]: edge2,
    },
  };
}

describe("cue-mapper", () => {
  const graph = createMockGraph();

  describe("buildValidatedVideoCues", () => {
    it("partitions duration into contiguous non overlapping intervals across [0, durationSeconds]", () => {
      const cues = buildValidatedVideoCues({
        durationSeconds: 30,
        messageContent:
          "First chapter introduction. Second chapter parsing. Third chapter types.",
        pathTrace: {
          id: "trace-1",
          sourceNodeId: "file-1",
          targetNodeId: "file-3",
          stepNodeIds: ["file-1", "file-2", "file-3"],
          stepEdgeIds: [
            "file-1->file-2:file_import",
            "file-2->file-3:file_import",
          ],
          hopCount: 2,
          rationale: "Data flow from index to types",
          createdAt: new Date().toISOString(),
        },
        graph,
      });

      expect(cues.length).toBeGreaterThanOrEqual(3);
      expect(cues.length).toBeLessThanOrEqual(6);

      expect(cues[0].startTimeSeconds).toBe(0);
      expect(cues[cues.length - 1].endTimeSeconds).toBe(30);

      for (let i = 0; i < cues.length - 1; i++) {
        expect(cues[i].endTimeSeconds).toBe(cues[i + 1].startTimeSeconds);
        expect(cues[i].endTimeSeconds).toBeGreaterThan(
          cues[i].startTimeSeconds,
        );
      }
    });

    it("prunes unknown node IDs and connects valid edges", () => {
      const cues = buildValidatedVideoCues({
        durationSeconds: 20,
        upstreamScenes: [
          {
            title: "Entry point",
            narration: "Starts at index.ts",
            targetNodeIds: ["file-1", "nonexistent-node-xyz"],
          },
          {
            title: "Parser core",
            narration: "Passes through parser.ts",
            targetNodeIds: ["file-2", "fake-404"],
          },
          {
            title: "Types",
            narration: "Terminates at types.ts",
            targetNodeIds: ["file-3"],
          },
        ],
        messageContent: "Code walkthrough",
        graph,
      });

      expect(cues).toHaveLength(3);
      expect(cues[0].nodeIds).toEqual(["file-1"]);
      expect(cues[0].focalNodeId).toBe("file-1");
      expect(cues[1].nodeIds).toEqual(["file-2"]);
      expect(cues[2].nodeIds).toEqual(["file-3"]);
    });

    it("clamps durationSeconds to between 15 and 45 seconds", () => {
      const cuesShort = buildValidatedVideoCues({
        durationSeconds: 5,
        messageContent: "Short test",
        graph,
      });
      expect(cuesShort[cuesShort.length - 1].endTimeSeconds).toBe(15);

      const cuesLong = buildValidatedVideoCues({
        durationSeconds: 120,
        messageContent: "Long test",
        graph,
      });
      expect(cuesLong[cuesLong.length - 1].endTimeSeconds).toBe(45);
    });
  });

  describe("findActiveCueIndex", () => {
    const mockCues: readonly VideoTimelineCue[] = [
      {
        cueId: "c1",
        index: 0,
        startTimeSeconds: 0,
        endTimeSeconds: 10,
        title: "Ch 1",
        narration: "Narr 1",
        nodeIds: ["file-1"],
        edgeIds: [],
        focalNodeId: "file-1",
      },
      {
        cueId: "c2",
        index: 1,
        startTimeSeconds: 10,
        endTimeSeconds: 20,
        title: "Ch 2",
        narration: "Narr 2",
        nodeIds: ["file-2"],
        edgeIds: [],
        focalNodeId: "file-2",
      },
      {
        cueId: "c3",
        index: 2,
        startTimeSeconds: 20,
        endTimeSeconds: 30,
        title: "Ch 3",
        narration: "Narr 3",
        nodeIds: ["file-3"],
        edgeIds: [],
        focalNodeId: "file-3",
      },
    ];

    it("returns null for empty cues or negative currentTime", () => {
      expect(findActiveCueIndex([], 5)).toBeNull();
      expect(findActiveCueIndex(mockCues, -1)).toBeNull();
    });

    it("returns index 0 at start time 0.0s", () => {
      expect(findActiveCueIndex(mockCues, 0)).toBe(0);
      expect(findActiveCueIndex(mockCues, 5)).toBe(0);
      expect(findActiveCueIndex(mockCues, 9.99)).toBe(0);
    });

    it("transitions precisely at boundary timestamps", () => {
      expect(findActiveCueIndex(mockCues, 10.0)).toBe(1);
      expect(findActiveCueIndex(mockCues, 19.99)).toBe(1);
      expect(findActiveCueIndex(mockCues, 20.0)).toBe(2);
    });

    it("returns final cue index when time is at or beyond duration", () => {
      expect(findActiveCueIndex(mockCues, 30.0)).toBe(2);
      expect(findActiveCueIndex(mockCues, 50.0)).toBe(2);
    });
  });
});
