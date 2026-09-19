import type { AIRequestContext } from "@/lib/ai/types";
import { findDependencyPath } from "@/graph/path-trace";
import { findClosestCommonAncestor } from "@/graph/path-validation";
import type { DemoAnswer } from "../types";
import { createDemoCitation } from "../citations";

/**
 * Extracts candidate file IDs mentioned in the prompt.
 */
function findMentionedFileIds(
  prompt: string,
  context: AIRequestContext,
): readonly string[] {
  const lowerPrompt = prompt.toLowerCase();
  const matched: string[] = [];

  for (const file of Object.values(context.graph.files ?? {})) {
    const fileName = file.name.toLowerCase();
    const filePath = file.path.toLowerCase();
    if (lowerPrompt.includes(fileName) || lowerPrompt.includes(filePath)) {
      matched.push(file.id);
    }
  }

  return Object.freeze(matched);
}

/**
 * Builds a path trace answer connecting two modules or explaining separation.
 */
export function buildPathTraceAnswer(
  context: AIRequestContext,
  prompt: string,
): DemoAnswer {
  const files = Object.values(context.graph.files ?? {});
  const repoName = context.repository.fullName || "repository";

  if (files.length === 0) {
    return Object.freeze({
      intent: "path_trace",
      markdown: `### Dependency Path\n\nNo files available in the graph to trace paths.`,
      citations: Object.freeze([]),
      highlightNodeIds: Object.freeze([]),
      trace: null,
      isFallback: true,
    });
  }

  const mentioned = findMentionedFileIds(prompt, context);
  let sourceFile = files[0];
  let targetFile = files[Math.min(1, files.length - 1)];

  if (mentioned.length >= 2) {
    sourceFile = context.graph.files[mentioned[0]] ?? sourceFile;
    targetFile = context.graph.files[mentioned[1]] ?? targetFile;
  } else if (mentioned.length === 1) {
    sourceFile = context.graph.files[mentioned[0]] ?? sourceFile;
    targetFile = files.find((f) => f.id !== sourceFile.id) ?? sourceFile;
  } else {
    // Pick first connected edge if available
    const edgeList = Object.values(context.graph.edges ?? {});
    if (edgeList.length > 0) {
      const sampleEdge = edgeList[0];
      const src = context.graph.files[sampleEdge.sourceId];
      const tgt = context.graph.files[sampleEdge.targetId];
      if (src && tgt) {
        sourceFile = src;
        targetFile = tgt;
      }
    }
  }

  const discoveredTrace = findDependencyPath(
    context.graph,
    sourceFile.id,
    targetFile.id,
  );

  if (discoveredTrace) {
    const markdown = [
      `### Dependency Path: \`${sourceFile.path}\` → \`${targetFile.path}\`\n\n`,
      `Analysis of **${repoName}** confirms a direct dependency chain connecting these modules across **${discoveredTrace.hopCount}** hop(s).\n\n`,
      `**Architecture flow:**\n`,
      `1. **Origin**: \`${sourceFile.path}\` imports downstream symbols for execution.\n`,
      `2. **Target**: \`${targetFile.path}\` provides the requisite domain functionality.\n\n`,
      `Visual path highlight has been activated on the graph canvas. You can click any citation below to jump directly into the code viewer.`,
    ].join("");

    const citations = discoveredTrace.stepNodeIds
      .map((id) => {
        const f = context.graph.files[id];
        return f ? createDemoCitation(f.id, f.path) : null;
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);

    return Object.freeze({
      intent: "path_trace",
      markdown,
      citations: Object.freeze(citations),
      highlightNodeIds: Object.freeze([]), // Path trace uses trace, never highlight event
      trace: discoveredTrace,
      isFallback: false,
    });
  }

  // Disconnected query: explain architectural separation and common ancestor
  const commonAncestor = findClosestCommonAncestor(
    sourceFile.path,
    targetFile.path,
  );

  const markdown = [
    `### Architectural Separation Notice\n\n`,
    `No directed dependency path was found connecting \`${sourceFile.path}\` to \`${targetFile.path}\` in the current graph.\n\n`,
    `**Closest Common Directory:** \`${commonAncestor.commonDirectory}\`\n\n`,
    `${commonAncestor.rationale}\n\n`,
    `These modules represent distinct architectural concerns that do not communicate directly.`,
  ].join("");

  const citations = Object.freeze([
    createDemoCitation(sourceFile.id, sourceFile.path),
    createDemoCitation(targetFile.id, targetFile.path),
  ]);

  return Object.freeze({
    intent: "path_trace",
    markdown,
    citations,
    highlightNodeIds: Object.freeze([]),
    trace: null,
    isFallback: false,
    warning: `No dependency path exists between ${sourceFile.name} and ${targetFile.name}. They meet at ${commonAncestor.commonDirectory}.`,
  });
}
