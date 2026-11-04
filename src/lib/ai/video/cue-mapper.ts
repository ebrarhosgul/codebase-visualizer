import type { CodebaseGraph, PathTrace } from "@/entities";
import type { CitationRef } from "@/lib/ai/types";
import type { ScrimbaUpstreamScene, VideoTimelineCue } from "./types";
import { getHeuristicIndex } from "@/graph/heuristic-index";

export interface BuildValidatedVideoCuesInput {
  readonly durationSeconds: number;
  readonly upstreamScenes?: readonly ScrimbaUpstreamScene[];
  readonly messageContent: string;
  readonly pathTrace?: PathTrace | null;
  readonly citations?: readonly CitationRef[];
  readonly graph: CodebaseGraph;
}

/**
 * Validates whether an entity ID exists in graph.files or graph.symbols.
 */
function isValidNodeId(id: string, graph: CodebaseGraph): boolean {
  return Boolean(graph.files[id] || graph.symbols[id]);
}

/**
 * Gathers fallback valid node IDs from pathTrace, citations, or top fan-in files.
 */
function getFallbackNodeIds(
  graph: CodebaseGraph,
  pathTrace?: PathTrace | null,
  citations?: readonly CitationRef[],
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  // 1. Path trace hops
  if (pathTrace?.stepNodeIds) {
    for (const id of pathTrace.stepNodeIds) {
      if (isValidNodeId(id, graph) && !seen.has(id)) {
        seen.add(id);
        result.push(id);
      }
    }
  }

  // 2. Citations
  if (citations) {
    for (const cite of citations) {
      if (isValidNodeId(cite.fileId, graph) && !seen.has(cite.fileId)) {
        seen.add(cite.fileId);
        result.push(cite.fileId);
      }
    }
  }

  // 3. Top fan-in files if still empty
  if (result.length === 0) {
    const index = getHeuristicIndex(graph);
    const sortedFileIds = Object.keys(graph.files).sort(
      (a, b) => (index.fanIn[b] ?? 0) - (index.fanIn[a] ?? 0),
    );
    for (const id of sortedFileIds) {
      if (!seen.has(id)) {
        seen.add(id);
        result.push(id);
        if (result.length >= 6) break;
      }
    }
  }

  return result;
}

/**
 * Finds connecting edges in the graph between the given set of nodes.
 */
function findConnectingEdgeIds(
  nodeIds: readonly string[],
  graph: CodebaseGraph,
): string[] {
  if (nodeIds.length === 0) return [];
  const nodeSet = new Set(nodeIds);
  const matchedEdgeIds: string[] = [];

  for (const edge of Object.values(graph.edges)) {
    if (nodeSet.has(edge.sourceId) && nodeSet.has(edge.targetId)) {
      matchedEdgeIds.push(edge.id);
    }
  }

  return matchedEdgeIds;
}

/**
 * Resolves contiguous non-overlapping time intervals across [0, durationSeconds].
 * Uses valid upstream scene timestamps when present and monotonic; otherwise falls back
 * to equal proportional slices.
 */
function resolveContiguousIntervals(
  candidateScenes: readonly ScrimbaUpstreamScene[],
  count: number,
  durationSeconds: number,
): { start: number; end: number }[] {
  const hasValidTimestamps =
    candidateScenes.length === count &&
    count > 0 &&
    candidateScenes.every((scene, idx) => {
      const s = scene.startTimeSeconds;
      const e = scene.endTimeSeconds;
      if (typeof s !== "number" || typeof e !== "number") return false;
      if (!Number.isFinite(s) || !Number.isFinite(e)) return false;
      if (s < 0 || e <= s) return false;
      if (e > durationSeconds + 1) return false;
      if (idx > 0) {
        const prevEnd = candidateScenes[idx - 1].endTimeSeconds ?? 0;
        if (s < prevEnd - 0.5) return false;
      }
      return true;
    });

  if (hasValidTimestamps) {
    const intervals: { start: number; end: number }[] = [];
    for (let i = 0; i < count; i++) {
      const start = i === 0 ? 0 : intervals[i - 1].end;
      const upstreamEnd = candidateScenes[i].endTimeSeconds!;
      const end =
        i === count - 1
          ? durationSeconds
          : Math.min(
              durationSeconds - (count - 1 - i) * 0.5,
              Math.max(start + 0.5, Math.round(upstreamEnd * 100) / 100),
            );
      intervals.push({ start, end });
    }
    return intervals;
  }

  const intervals: { start: number; end: number }[] = [];
  for (let i = 0; i < count; i++) {
    const start = i === 0 ? 0 : intervals[i - 1].end;
    const end =
      i === count - 1
        ? durationSeconds
        : Math.round(((i + 1) * durationSeconds * 100) / count) / 100;
    intervals.push({ start, end });
  }
  return intervals;
}

/**
 * Pure client-side cue validator and normalizer.
 * Enforces contiguous non-overlapping intervals across [0, durationSeconds]
 * and validates all IDs against the in-memory CodebaseGraph.
 */
export function buildValidatedVideoCues(
  input: BuildValidatedVideoCuesInput,
): readonly VideoTimelineCue[] {
  const {
    durationSeconds: rawDuration,
    upstreamScenes,
    messageContent,
    pathTrace,
    citations,
    graph,
  } = input;

  const durationSeconds = Math.max(
    15,
    Math.min(45, Math.round(rawDuration || 30)),
  );
  const fallbackNodes = getFallbackNodeIds(graph, pathTrace, citations);

  // Determine chapter count: between 3 and 6
  let candidateScenes = upstreamScenes?.slice(0, 6) ?? [];
  let count = candidateScenes.length;
  if (count < 3) {
    count = Math.max(3, Math.min(6, fallbackNodes.length || 3));
  } else if (count > 6) {
    count = 6;
    candidateScenes = candidateScenes.slice(0, 6);
  }

  // Contiguous time slices across [0, durationSeconds]
  const intervals = resolveContiguousIntervals(
    candidateScenes,
    count,
    durationSeconds,
  );

  const cues: VideoTimelineCue[] = [];

  for (let i = 0; i < count; i++) {
    const scene = candidateScenes[i];
    const interval = intervals[i];

    // Collect and validate node IDs for this chapter
    const rawTargetNodes = scene?.targetNodeIds ?? [];
    let validNodeIds = rawTargetNodes.filter((id) => isValidNodeId(id, graph));

    if (validNodeIds.length === 0) {
      if (fallbackNodes.length > 0) {
        // Assign a slice of fallback nodes to this chapter
        const chunkSize = Math.max(1, Math.ceil(fallbackNodes.length / count));
        const slice = fallbackNodes.slice(i * chunkSize, (i + 1) * chunkSize);
        validNodeIds =
          slice.length > 0 ? slice : [fallbackNodes[i % fallbackNodes.length]];
      }
    }

    const focalNodeId = validNodeIds[0] ?? null;

    // Collect connecting edges between nodes in this chapter
    const connectingEdges = findConnectingEdgeIds(validNodeIds, graph);

    // Title resolution
    let title = scene?.title?.trim();
    if (!title) {
      const focalFile = focalNodeId ? graph.files[focalNodeId] : null;
      title = focalFile
        ? `Chapter ${i + 1}: ${focalFile.name}`
        : `Chapter ${i + 1}: Overview`;
    }

    // Narration resolution
    let narration = scene?.narration?.trim();
    if (!narration) {
      if (pathTrace?.rationale) {
        narration = pathTrace.rationale;
      } else if (messageContent) {
        const sentences = messageContent
          .split(/(?<=[.?!])\s+/)
          .map((s) => s.trim())
          .filter(Boolean);
        narration =
          sentences[i] ?? sentences[0] ?? "Architectural walkthrough chapter.";
      } else {
        narration = `Architectural walk through chapter ${i + 1}.`;
      }
    }

    cues.push({
      cueId: `cue-${i}-${interval.start}`,
      index: i,
      startTimeSeconds: interval.start,
      endTimeSeconds: interval.end,
      title,
      narration,
      nodeIds: Object.freeze(validNodeIds),
      edgeIds: Object.freeze(connectingEdges),
      focalNodeId,
    });
  }

  return Object.freeze(cues);
}

/**
 * Pure binary or linear search to find the active cue at a given video timestamp.
 * Returns null if cues array is empty or time is negative.
 * Returns the final cue if currentTimeSeconds >= durationSeconds.
 */
export function findActiveCueIndex(
  cues: readonly VideoTimelineCue[],
  currentTimeSeconds: number,
): number | null {
  if (cues.length === 0 || currentTimeSeconds < 0) {
    return null;
  }

  const lastCue = cues[cues.length - 1];
  if (currentTimeSeconds >= lastCue.endTimeSeconds) {
    return cues.length - 1;
  }

  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    if (
      currentTimeSeconds >= cue.startTimeSeconds &&
      currentTimeSeconds < cue.endTimeSeconds
    ) {
      return i;
    }
  }

  return cues.length - 1;
}
