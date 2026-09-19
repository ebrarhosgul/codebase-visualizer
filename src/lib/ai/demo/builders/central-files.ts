import type { CodebaseGraph } from "@/entities";
import type { HeuristicIndex } from "@/graph/heuristic-index";
import type { DemoAnswer } from "../types";
import { createDemoCitation } from "../citations";

/**
 * Compares two strings using raw Unicode codepoint order.
 */
function compareCodepoints(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Builds the "Core bottleneck / central files" answer ranked by incoming internal fan-in.
 */
export function buildCentralFilesAnswer(
  graph: CodebaseGraph,
  index: HeuristicIndex,
): DemoAnswer {
  const repoName = graph.repository?.fullName || "the repository";

  // Filter internal files with fanIn > 0
  const candidateIds = Object.keys(index.fanIn).filter(
    (fileId) => (index.fanIn[fileId] ?? 0) > 0 && Boolean(graph.files[fileId]),
  );

  // When no file has fanIn > 0, return AC-10 honest paragraph
  if (candidateIds.length === 0) {
    return Object.freeze({
      intent: "central_files",
      markdown: `### Core Central Files\n\n${index.fileCount} files parsed, no internal import edges detected, so centrality cannot be ranked.`,
      citations: Object.freeze([]),
      highlightNodeIds: Object.freeze([]),
      trace: null,
      isFallback: true,
    });
  }

  // Sort: fanIn desc -> fanOut desc -> path asc by raw codepoint comparison
  candidateIds.sort((idA, idB) => {
    const inA = index.fanIn[idA] ?? 0;
    const inB = index.fanIn[idB] ?? 0;
    if (inB !== inA) return inB - inA;

    const outA = index.fanOut[idA] ?? 0;
    const outB = index.fanOut[idB] ?? 0;
    if (outB !== outA) return outB - outA;

    const pathA = graph.files[idA]?.path ?? "";
    const pathB = graph.files[idB]?.path ?? "";
    return compareCodepoints(pathA, pathB);
  });

  const topFiles = candidateIds.slice(0, 5);

  const lines = topFiles.map((fileId, idx) => {
    const file = graph.files[fileId];
    const fanInCount = index.fanIn[fileId] ?? 0;
    const fanOutCount = index.fanOut[fileId] ?? 0;
    return `${idx + 1}. \`${file.path}\` — **${fanInCount}** incoming importer(s), **${fanOutCount}** outgoing dependency(ies)`;
  });

  const markdown = [
    `### Core Central Files for \`${repoName}\`\n\n`,
    `The following modules have the highest internal coupling in the codebase, ranked by incoming fan in (number of distinct internal files importing them):\n\n`,
    lines.join("\n"),
    `\n\nThese modules represent primary architectural hubs. Changes here may impact multiple downstream consumers.`,
  ].join("");

  const citations = Object.freeze(
    topFiles.map((id) => createDemoCitation(id, graph.files[id].path)),
  );

  return Object.freeze({
    intent: "central_files",
    markdown,
    citations,
    highlightNodeIds: Object.freeze(citations.map((c) => c.fileId)),
    trace: null,
    isFallback: false,
  });
}
