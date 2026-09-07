import type {
  AIProvider,
  AIRequestContext,
  AIStreamEvent,
  CitationRef,
} from "./types";
import { findDependencyPath } from "@/graph/path-trace";
import { findClosestCommonAncestor } from "@/graph/path-validation";
import { classifyLayerForPath } from "@/graph/layers";

/**
 * Artificial micro delay to emulate real streaming during demo mode without external network costs.
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

/**
 * Extracts candidate file IDs from user prompt matching files in the graph.
 */
function findMentionedFileIds(
  prompt: string,
  context: AIRequestContext,
): readonly string[] {
  const lowerPrompt = prompt.toLowerCase();
  const matched: string[] = [];

  for (const file of Object.values(context.graph.files)) {
    const fileName = file.name.toLowerCase();
    const filePath = file.path.toLowerCase();
    if (lowerPrompt.includes(fileName) || lowerPrompt.includes(filePath)) {
      matched.push(file.id);
    }
  }

  return Object.freeze(matched);
}

/**
 * Builds a CitationRef entity from a FileEntity.
 */
function createCitation(
  fileId: string,
  filePath: string,
  line = 1,
  label?: string,
): CitationRef {
  return {
    id: `cite:${fileId}_${line}`,
    fileId,
    line,
    column: 1,
    label: label ?? filePath,
    snippet: `// Source declaration in ${filePath}`,
  };
}

/**
 * Zero cost demo provider delivering canned architectural answers and dynamic BFS verified paths.
 */
export class DemoAIProvider implements AIProvider {
  readonly id = "demo" as const;
  readonly name = "Demo Mode (Offline)";

  async *streamQuery(
    messages: readonly {
      readonly role: "user" | "assistant" | "system";
      readonly content: string;
    }[],
    context: AIRequestContext,
    _apiKey?: string,
    signal?: AbortSignal,
  ): AsyncGenerator<AIStreamEvent, void, unknown> {
    const lastUserMessage = [...messages]
      .reverse()
      .find((m) => m.role === "user");
    const query = lastUserMessage?.content.trim() ?? "";
    const lowerQuery = query.toLowerCase();

    const files = Object.values(context.graph.files);
    const repoName = context.repository.fullName || "repository";

    // Scenario 1: Path tracing query
    const isPathQuery =
      lowerQuery.includes("path") ||
      lowerQuery.includes("trace") ||
      lowerQuery.includes("flow") ||
      lowerQuery.includes("depends") ||
      lowerQuery.includes("connect");

    if (isPathQuery && files.length > 0) {
      const mentioned = findMentionedFileIds(query, context);
      let sourceFile = files[0];
      let targetFile = files[Math.min(1, files.length - 1)];

      if (mentioned.length >= 2) {
        sourceFile = context.graph.files[mentioned[0]] ?? sourceFile;
        targetFile = context.graph.files[mentioned[1]] ?? targetFile;
      } else if (mentioned.length === 1) {
        sourceFile = context.graph.files[mentioned[0]] ?? sourceFile;
        // Pick a connected or different file
        targetFile = files.find((f) => f.id !== sourceFile.id) ?? sourceFile;
      } else {
        // Find any two connected files in graph edges if available
        const edgeList = Object.values(context.graph.edges);
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
        const textChunks = [
          `### Dependency Path: \`${sourceFile.path}\` → \`${targetFile.path}\`\n\n`,
          `Analysis of **${repoName}** confirms a direct dependency chain connecting these modules across **${discoveredTrace.hopCount}** hop(s).\n\n`,
          `**Architecture flow:**\n`,
          `1. **Origin**: \`${sourceFile.path}\` imports downstream symbols for execution.\n`,
          `2. **Target**: \`${targetFile.path}\` provides the requisite domain functionality.\n\n`,
          `Visual path highlight has been activated on the graph canvas. You can click any citation below to jump directly into the code viewer.`,
        ];

        for (const chunk of textChunks) {
          if (signal?.aborted) return;
          yield { type: "text", text: chunk };
          await sleep(25, signal);
        }

        const citations: CitationRef[] = discoveredTrace.stepNodeIds
          .map((id) => {
            const f = context.graph.files[id];
            return f ? createCitation(f.id, f.path, 1, f.name) : null;
          })
          .filter((c): c is CitationRef => c !== null);

        yield { type: "trace", trace: discoveredTrace };
        if (citations.length > 0) {
          yield { type: "citations", citations: Object.freeze(citations) };
        }
        yield { type: "done" };
        return;
      }

      // Disconnected query: explain architectural separation and compute closest common ancestor
      const commonAncestor = findClosestCommonAncestor(
        sourceFile.path,
        targetFile.path,
      );

      const textChunks = [
        `### Architectural Separation Notice\n\n`,
        `No directed dependency path was found connecting \`${sourceFile.path}\` to \`${targetFile.path}\` in the current graph.\n\n`,
        `**Closest Common Directory:** \`${commonAncestor.commonDirectory}\`\n\n`,
        `${commonAncestor.rationale}\n\n`,
        `These modules represent distinct architectural concerns that do not communicate directly.`,
      ];

      for (const chunk of textChunks) {
        if (signal?.aborted) return;
        yield { type: "text", text: chunk };
        await sleep(25, signal);
      }

      yield {
        type: "warning",
        message: `No dependency path exists between ${sourceFile.name} and ${targetFile.name}. They meet at ${commonAncestor.commonDirectory}.`,
      };

      const citations = [
        createCitation(sourceFile.id, sourceFile.path, 1, sourceFile.name),
        createCitation(targetFile.id, targetFile.path, 1, targetFile.name),
      ];

      yield { type: "citations", citations: Object.freeze(citations) };
      yield { type: "done" };
      return;
    }

    // Scenario 2: Architectural layer breakdown query
    const isLayerQuery =
      lowerQuery.includes("layer") ||
      lowerQuery.includes("structure") ||
      lowerQuery.includes("overview") ||
      lowerQuery.includes("architecture");

    if (isLayerQuery) {
      const layerCounts = new Map<string, number>();
      for (const f of files) {
        const layer = classifyLayerForPath(f.path);
        layerCounts.set(layer, (layerCounts.get(layer) ?? 0) + 1);
      }

      const layerBreakdown = Array.from(layerCounts.entries())
        .map(([layer, count]) => `- **${layer}**: ${count} file(s)`)
        .join("\n");

      const textChunks = [
        `### Architecture Overview for \`${repoName}\`\n\n`,
        `This codebase organizes its modules into structured architectural layers:\n\n`,
        `${layerBreakdown}\n\n`,
        `The modules adhere to clean separation of concerns, maintaining unidirectionally bound dependency relationships.\n`,
      ];

      for (const chunk of textChunks) {
        if (signal?.aborted) return;
        yield { type: "text", text: chunk };
        await sleep(25, signal);
      }

      const topFiles = files.slice(0, 4);
      const citations = topFiles.map((f) =>
        createCitation(f.id, f.path, 1, f.name),
      );

      if (citations.length > 0) {
        yield { type: "citations", citations: Object.freeze(citations) };
      }
      yield { type: "done" };
      return;
    }

    // Scenario 3: General repository summary
    const textChunks = [
      `### Codebase Analysis: \`${repoName}\`\n\n`,
      `**Summary Metrics:**\n`,
      `- **Total files**: ${files.length}\n`,
      `- **Total edges**: ${Object.keys(context.graph.edges).length}\n`,
      `- **Total directories**: ${Object.keys(context.graph.directories).length}\n\n`,
      `You can ask targeted queries about paths between specific components, or request layer inspection summaries.\n`,
    ];

    for (const chunk of textChunks) {
      if (signal?.aborted) return;
      yield { type: "text", text: chunk };
      await sleep(25, signal);
    }

    const sampleFiles = files.slice(0, 3);
    const citations = sampleFiles.map((f) =>
      createCitation(f.id, f.path, 1, f.name),
    );

    if (citations.length > 0) {
      yield { type: "citations", citations: Object.freeze(citations) };
    }
    yield { type: "done" };
  }
}
