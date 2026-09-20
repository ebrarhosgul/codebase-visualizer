import type { CodebaseGraph } from "@/entities";
import { getLayerDefinition, type ArchitecturalLayerId } from "@/graph/layers";
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
 * Builds a reverse adjacency map of internal incoming importers for each file.
 */
function buildReverseAdjacency(graph: CodebaseGraph): Record<string, string[]> {
  const reverseMap: Record<string, string[]> = {};
  const seenPairs = new Set<string>();

  for (const edge of Object.values(graph.edges ?? {})) {
    if (edge.isExternal) continue;
    if (edge.kind !== "file_import" && edge.kind !== "re_export") continue;
    if (!graph.files[edge.sourceId] || !graph.files[edge.targetId]) continue;

    const key = `${edge.sourceId}-->${edge.targetId}`;
    if (seenPairs.has(key)) continue;
    seenPairs.add(key);

    if (!reverseMap[edge.targetId]) {
      reverseMap[edge.targetId] = [];
    }
    reverseMap[edge.targetId].push(edge.sourceId);
  }

  return reverseMap;
}

/**
 * Sorts file IDs by fanIn desc, then path asc by raw codepoints.
 */
function sortFiles(
  fileIds: readonly string[],
  graph: CodebaseGraph,
  index: HeuristicIndex,
): string[] {
  return [...fileIds].sort((idA, idB) => {
    const inA = index.fanIn[idA] ?? 0;
    const inB = index.fanIn[idB] ?? 0;
    if (inB !== inA) return inB - inA;

    const pathA = graph.files[idA]?.path ?? "";
    const pathB = graph.files[idB]?.path ?? "";
    return compareCodepoints(pathA, pathB);
  });
}

/**
 * Builds the "State management flow" answer tracing store modules and consumers.
 */
export function buildStateFlowAnswer(
  graph: CodebaseGraph,
  index: HeuristicIndex,
): DemoAnswer {
  const repoName = graph.repository?.fullName || "the repository";

  // AC-10 check: no internal import edges
  if (index.internalEdgeCount === 0) {
    return Object.freeze({
      intent: "state_flow",
      markdown: `### State Management Flow\n\n${index.fileCount} files parsed, no internal import edges detected, so centrality cannot be ranked.`,
      citations: Object.freeze([]),
      highlightNodeIds: Object.freeze([]),
      trace: null,
      isFallback: true,
    });
  }

  const reverseAdjacency = buildReverseAdjacency(graph);
  const storeLayerFiles = index.filesByLayer.stores ?? [];

  let seeds: string[] = [];
  let isSymbolFallback = false;

  if (storeLayerFiles.length > 0) {
    seeds = sortFiles(storeLayerFiles, graph, index).slice(0, 3);
  } else {
    // Fallback: search symbols matching /store|state|context|provider|atom|slice/i
    const stateSymbolRegex = /store|state|context|provider|atom|slice/i;
    const matchedFileIds = new Set<string>();

    for (const file of Object.values(graph.files ?? {})) {
      const exportIds = file.exportIds ?? [];
      for (const sid of exportIds) {
        const symbol = graph.symbols?.[sid];
        if (symbol?.name && stateSymbolRegex.test(symbol.name)) {
          matchedFileIds.add(file.id);
          break;
        }
      }
    }

    if (matchedFileIds.size > 0) {
      seeds = sortFiles(Array.from(matchedFileIds), graph, index).slice(0, 3);
      isSymbolFallback = true;
    }
  }

  // When no state pattern is detected
  if (seeds.length === 0) {
    return Object.freeze({
      intent: "state_flow",
      markdown: `### State Management Flow\n\nNo state management pattern was detected in the loaded codebase.`,
      citations: Object.freeze([]),
      highlightNodeIds: Object.freeze([]),
      trace: null,
      isFallback: true,
    });
  }

  const seen = new Set<string>();
  for (const s of seeds) {
    seen.add(s);
  }

  interface StoreFlow {
    seedId: string;
    hop1Importers: {
      fileId: string;
      layerId: ArchitecturalLayerId;
      layerRank: number;
    }[];
    hop2Importers: string[];
  }

  const flows: StoreFlow[] = [];
  const citationCandidateIds: string[] = [];

  for (const seedId of seeds) {
    const rawHop1 = reverseAdjacency[seedId] ?? [];
    const availableHop1 = rawHop1.filter((id) => !seen.has(id));
    const sortedHop1 = sortFiles(availableHop1, graph, index).slice(0, 3);

    for (const h1 of sortedHop1) {
      seen.add(h1);
    }

    const hop1WithLayers = sortedHop1.map((id) => {
      const layerId = index.layerByFile[id] ?? "other";
      return {
        fileId: id,
        layerId,
        layerRank: getLayerDefinition(layerId).rank,
      };
    });

    let hop2Importers: string[] = [];
    // Only the single highest fan-in hop 1 importer expands to hop 2
    if (sortedHop1.length > 0) {
      const primaryHop1 = sortedHop1[0];
      const rawHop2 = reverseAdjacency[primaryHop1] ?? [];
      const availableHop2 = rawHop2.filter((id) => !seen.has(id));
      hop2Importers = sortFiles(availableHop2, graph, index).slice(0, 3);

      for (const h2 of hop2Importers) {
        seen.add(h2);
      }
    }

    flows.push({
      seedId,
      hop1Importers: hop1WithLayers,
      hop2Importers,
    });

    // Traversal order for citations: seed -> hop 1 importers by layer rank -> hop 2 importers
    citationCandidateIds.push(seedId);

    const hop1SortedByLayer = [...hop1WithLayers].sort((a, b) => {
      if (a.layerRank !== b.layerRank) return a.layerRank - b.layerRank;
      const pathA = graph.files[a.fileId]?.path ?? "";
      const pathB = graph.files[b.fileId]?.path ?? "";
      return compareCodepoints(pathA, pathB);
    });

    for (const h1 of hop1SortedByLayer) {
      citationCandidateIds.push(h1.fileId);
    }

    for (const h2 of hop2Importers) {
      citationCandidateIds.push(h2);
    }
  }

  const rawCitations = citationCandidateIds.map((id) =>
    createDemoCitation(id, graph.files[id]?.path ?? id),
  );
  const citations = deduplicateCitations(rawCitations, 8);

  // Format markdown
  const headerNote = isSymbolFallback
    ? `No dedicated \`stores\` directory was found; state management flow is inferred from exported state symbols in \`${repoName}\`:\n\n`
    : `State management flow traced across store modules in \`${repoName}\`:\n\n`;

  const flowSections = flows.map((flow, idx) => {
    const seedFile = graph.files[flow.seedId];
    const seedPath = seedFile?.path ?? flow.seedId;

    const hop1Lines =
      flow.hop1Importers.length > 0
        ? flow.hop1Importers
            .map((h1) => {
              const file = graph.files[h1.fileId];
              const layerLabel = getLayerDefinition(h1.layerId).label;
              return `  - \`${file?.path ?? h1.fileId}\` (${layerLabel})`;
            })
            .join("\n")
        : "  - No direct importers detected.";

    let hop2Text = "";
    if (flow.hop1Importers.length > 0 && flow.hop2Importers.length > 0) {
      const primaryH1File = graph.files[flow.hop1Importers[0].fileId];
      const primaryH1Path = primaryH1File?.path ?? flow.hop1Importers[0].fileId;
      const h2Lines = flow.hop2Importers
        .map((h2Id) => {
          const file = graph.files[h2Id];
          const layerId = index.layerByFile[h2Id] ?? "other";
          return `    - \`${file?.path ?? h2Id}\` (${getLayerDefinition(layerId).label})`;
        })
        .join("\n");
      hop2Text = `\n  - Consumers of \`${primaryH1Path}\` (hop 2):\n${h2Lines}`;
    }

    return `**Store ${idx + 1}: \`${seedPath}\`**\n- Direct importers (hop 1):\n${hop1Lines}${hop2Text}`;
  });

  const markdown = [
    `### State Management Flow\n\n`,
    headerNote,
    flowSections.join("\n\n"),
    `\n\nState stores and consumer chains are highlighted on the canvas.`,
  ].join("");

  return Object.freeze({
    intent: "state_flow",
    markdown,
    citations,
    highlightNodeIds: Object.freeze(citations.map((c) => c.fileId)),
    trace: null,
    isFallback: false,
  });
}
