import type { CodebaseGraph } from "@/entities";
import {
  ARCHITECTURAL_LAYERS,
  type ArchitecturalLayerId,
  getLayerDefinition,
} from "@/graph/layers";
import type { HeuristicIndex } from "@/graph/heuristic-index";
import type { DemoAnswer } from "../types";
import { createDemoCitation, deduplicateCitations } from "../citations";

/**
 * Compares two strings using raw Unicode codepoint order.
 */
function compareCodepoints(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Sorts file IDs by fanIn desc, fanOut desc, then path asc by codepoints.
 */
function sortFilesByMetric(
  fileIds: readonly string[],
  graph: CodebaseGraph,
  index: HeuristicIndex,
): string[] {
  return [...fileIds].sort((idA, idB) => {
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
}

/**
 * Builds the "Architecture & layer breakdown" answer derived from the loaded graph.
 */
export function buildLayerBreakdownAnswer(
  graph: CodebaseGraph,
  index: HeuristicIndex,
): DemoAnswer {
  const repoName = graph.repository?.fullName || "the repository";

  if (index.fileCount === 0) {
    return Object.freeze({
      intent: "layer_breakdown",
      markdown: `### Architecture & Layer Breakdown\n\n0 files parsed, no layers to report.`,
      citations: Object.freeze([]),
      highlightNodeIds: Object.freeze([]),
      trace: null,
      isFallback: true,
    });
  }

  // 1. File count for top 5 layers by count (ties broken by rank ascending, "other" included)
  const layerCounts = ARCHITECTURAL_LAYERS.map((layer) => ({
    layerId: layer.id,
    label: layer.label,
    rank: layer.rank,
    count: index.filesByLayer[layer.id]?.length ?? 0,
  }));

  layerCounts.sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count;
    }
    return a.rank - b.rank;
  });

  const top5Layers = layerCounts.slice(0, 5).filter((l) => l.count > 0);

  // 2. Top 3 layer-to-layer dependency pairs by distinct internal import count (excluding self-pairs)
  const layerPairs: {
    sourceId: ArchitecturalLayerId;
    targetId: ArchitecturalLayerId;
    sourceLabel: string;
    targetLabel: string;
    count: number;
    sourceRank: number;
    targetRank: number;
  }[] = [];

  for (const src of ARCHITECTURAL_LAYERS) {
    for (const tgt of ARCHITECTURAL_LAYERS) {
      if (src.id === tgt.id) continue;
      const count = index.layerMatrix[src.id]?.[tgt.id] ?? 0;
      if (count > 0) {
        layerPairs.push({
          sourceId: src.id,
          targetId: tgt.id,
          sourceLabel: src.label,
          targetLabel: tgt.label,
          count,
          sourceRank: src.rank,
          targetRank: tgt.rank,
        });
      }
    }
  }

  layerPairs.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    if (a.sourceRank !== b.sourceRank) return a.sourceRank - b.sourceRank;
    return a.targetRank - b.targetRank;
  });

  const top3Pairs = layerPairs.slice(0, 3);

  // 3. Inverted pairs from index.invertedEdges (capped at 5)
  const invertedLines = index.invertedEdges.map((edge) => {
    const srcFile = graph.files[edge.sourceId];
    const tgtFile = graph.files[edge.targetId];
    const srcLayer = index.layerByFile[edge.sourceId] ?? "other";
    const tgtLayer = index.layerByFile[edge.targetId] ?? "other";
    return `- \`${srcFile?.path ?? edge.sourceId}\` (${getLayerDefinition(srcLayer).label}) → \`${tgtFile?.path ?? edge.targetId}\` (${getLayerDefinition(tgtLayer).label})`;
  });

  // 4. Two-pass citation allocation
  // Pass 1: One highest fan-in file per listed layer (up to 5)
  const pass1FileIds: string[] = [];
  for (const l of top5Layers) {
    const sorted = sortFilesByMetric(
      index.filesByLayer[l.layerId] ?? [],
      graph,
      index,
    );
    if (sorted.length > 0) {
      pass1FileIds.push(sorted[0]);
    }
  }

  // Pass 2: A second file for the top 3 layers by file count (up to 3 more)
  const pass2FileIds: string[] = [];
  const top3Layers = top5Layers.slice(0, 3);
  for (const l of top3Layers) {
    const sorted = sortFilesByMetric(
      index.filesByLayer[l.layerId] ?? [],
      graph,
      index,
    );
    if (sorted.length > 1) {
      pass2FileIds.push(sorted[1]);
    }
  }

  const rawCitations = [...pass1FileIds, ...pass2FileIds].map((id) =>
    createDemoCitation(id, graph.files[id]?.path ?? id),
  );
  const citations = deduplicateCitations(rawCitations, 8);

  // Markdown formatting
  const layerListText =
    top5Layers.length > 0
      ? top5Layers.map((l) => `- **${l.label}**: ${l.count} file(s)`).join("\n")
      : "- No categorized files found.";

  const pairsText =
    top3Pairs.length > 0
      ? top3Pairs
          .map(
            (p) =>
              `- **${p.sourceLabel}** → **${p.targetLabel}**: ${p.count} import relationship(s)`,
          )
          .join("\n")
      : "No cross layer imports detected.";

  const invertedText =
    invertedLines.length > 0
      ? invertedLines.join("\n")
      : "No inverted layer dependencies detected.";

  const markdown = [
    `### Architecture & Layer Breakdown for \`${repoName}\`\n\n`,
    `**Primary Layers by File Count:**\n`,
    layerListText,
    `\n\n**Strongest Cross Layer Dependencies:**\n`,
    pairsText,
    `\n\n**Inverted Layer Dependencies:**\n`,
    invertedText,
    `\n\nKey modules from each active layer have been highlighted on the canvas.`,
  ].join("");

  return Object.freeze({
    intent: "layer_breakdown",
    markdown,
    citations,
    highlightNodeIds: Object.freeze(citations.map((c) => c.fileId)),
    trace: null,
    isFallback: false,
  });
}
