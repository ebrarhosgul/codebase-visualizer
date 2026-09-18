import type { CodebaseGraph } from "@/entities";
import { ARCHITECTURAL_LAYERS } from "@/graph/layers";
import type { HeuristicIndex } from "@/graph/heuristic-index";
import type { DemoAnswer } from "../types";
import { createDemoCitation } from "../citations";

/**
 * Builds the repository overview answer when a prompt does not match targeted heuristics.
 */
export function buildOverviewAnswer(
  graph: CodebaseGraph,
  index: HeuristicIndex,
): DemoAnswer {
  const repoName = graph.repository?.fullName || "the repository";
  const dirCount = Object.keys(graph.directories ?? {}).length;

  const activeLayers = ARCHITECTURAL_LAYERS.map((layer) => ({
    label: layer.label,
    count: index.filesByLayer[layer.id]?.length ?? 0,
  })).filter((l) => l.count > 0);

  const layerSummary =
    activeLayers.length > 0
      ? activeLayers
          .map((l) => `- **${l.label}**: ${l.count} file(s)`)
          .join("\n")
      : "- No categorized files found.";

  // Pick top 3 files by fanIn for sample citations
  const candidateIds = Object.keys(graph.files ?? {}).sort((a, b) => {
    const inA = index.fanIn[a] ?? 0;
    const inB = index.fanIn[b] ?? 0;
    if (inB !== inA) return inB - inA;
    const pathA = graph.files[a]?.path ?? "";
    const pathB = graph.files[b]?.path ?? "";
    return pathA < pathB ? -1 : pathA > pathB ? 1 : 0;
  });

  const sampleIds = candidateIds.slice(0, 3);
  const citations = Object.freeze(
    sampleIds.map((id) => createDemoCitation(id, graph.files[id]?.path ?? id)),
  );

  const markdown = [
    `### Architecture Overview for \`${repoName}\`\n\n`,
    `**Repository Metrics:**\n`,
    `- **Total files**: ${index.fileCount}\n`,
    `- **Internal import edges**: ${index.internalEdgeCount}\n`,
    `- **Directories**: ${dirCount}\n\n`,
    `**Architectural Layers:**\n`,
    layerSummary,
    `\n\n**What Demo Mode Can Answer:**\n`,
    `Demo mode evaluates graph topology locally. You can ask about **layer breakdowns**, **central bottleneck files**, **state management flow**, or **dependency paths between files**.\n\n`,
    `For deeper semantic reasoning and natural language queries, add your own API key.`,
  ].join("");

  return Object.freeze({
    intent: "overview",
    markdown,
    citations,
    highlightNodeIds: Object.freeze(citations.map((c) => c.fileId)),
    trace: null,
    isFallback: false,
  });
}
