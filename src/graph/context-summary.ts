import type { CodebaseGraph, FileNode } from "@/entities";
import { classifyLayerForPath } from "./layers";

export interface ContextSummaryOptions {
  readonly tokenBudget?: number;
  readonly maxHighPriorityFiles?: number;
}

const COMMON_ENTRYPOINT_PATTERNS = [
  "index.ts",
  "index.tsx",
  "index.js",
  "main.ts",
  "main.tsx",
  "app/page.tsx",
  "pages/index.tsx",
  "app.ts",
  "app.tsx",
];

/**
 * Computes high priority files, entrypoints, and architectural outlines for model prompting.
 */
export function buildTopologyContextSummary(
  graph: CodebaseGraph,
  userPrompt: string,
  options: ContextSummaryOptions = {},
): string {
  const tokenBudget = options.tokenBudget ?? 20000;
  const maxChars = Math.floor(tokenBudget * 3.5); // ~3.5 chars per token heuristic
  const maxHighPriority = options.maxHighPriorityFiles ?? 15;

  const files = Object.values(graph.files);
  if (files.length === 0) {
    return "Repository has no parsed files.";
  }

  // 1. Calculate incoming fan-in count for every file
  const fanInMap = new Map<string, number>();
  for (const edge of Object.values(graph.edges)) {
    if (edge.kind === "file_import" || edge.kind === "re_export") {
      fanInMap.set(edge.targetId, (fanInMap.get(edge.targetId) ?? 0) + 1);
    }
  }

  // 2. Scan prompt for matching keywords
  const promptTokens = new Set(
    userPrompt
      .toLowerCase()
      .split(/[^a-zA-Z0-9_.-]+/)
      .filter((t) => t.length >= 3),
  );

  const promptMatchedFileIds = new Set<string>();
  for (const file of files) {
    const nameLower = file.name.toLowerCase();
    const pathLower = file.path.toLowerCase();
    for (const token of promptTokens) {
      if (nameLower.includes(token) || pathLower.includes(token)) {
        promptMatchedFileIds.add(file.id);
        break;
      }
    }
  }

  // 3. Identify entrypoints
  const entrypointFileIds = new Set<string>();
  for (const file of files) {
    const isEntry = COMMON_ENTRYPOINT_PATTERNS.some((pattern) =>
      file.path.endsWith(pattern),
    );
    if (isEntry) {
      entrypointFileIds.add(file.id);
    }
  }

  // 4. Rank high fan-in hubs
  const sortedByFanIn = [...files].sort(
    (a, b) => (fanInMap.get(b.id) ?? 0) - (fanInMap.get(a.id) ?? 0),
  );
  const hubFileIds = new Set<string>(
    sortedByFanIn.slice(0, 10).map((f) => f.id),
  );

  // Group high priority set
  const highPriorityFiles: FileNode[] = [];
  const remainingFiles: FileNode[] = [];

  for (const file of files) {
    if (
      promptMatchedFileIds.has(file.id) ||
      entrypointFileIds.has(file.id) ||
      hubFileIds.has(file.id)
    ) {
      if (highPriorityFiles.length < maxHighPriority) {
        highPriorityFiles.push(file);
      } else {
        remainingFiles.push(file);
      }
    } else {
      remainingFiles.push(file);
    }
  }

  // Build summary string within character budget
  const lines: string[] = [];
  lines.push(`Repository: ${graph.repository.fullName}`);
  lines.push(`Total Files: ${files.length}`);
  lines.push(`Total Dependency Edges: ${Object.keys(graph.edges).length}`);
  lines.push("");

  lines.push("### Key Modules and Entrypoints");
  for (const file of highPriorityFiles) {
    const layer = classifyLayerForPath(file.path);
    const symbols = file.symbolIds
      .map((sid: string) => graph.symbols[sid]?.name)
      .filter(Boolean)
      .slice(0, 6)
      .join(", ");
    const symbolList = symbols ? ` - Exports: [${symbols}]` : "";
    lines.push(`- \`${file.path}\` (${layer})${symbolList}`);
  }

  lines.push("");
  lines.push("### Remaining Architectural Outline");

  let currentLength = lines.join("\n").length;

  for (const file of remainingFiles) {
    const layer = classifyLayerForPath(file.path);
    const line = `- \`${file.path}\` (${layer})`;
    if (currentLength + line.length + 100 > maxChars) {
      lines.push(
        `... [${
          remainingFiles.length - lines.length
        } additional files truncated to preserve token budget]`,
      );
      break;
    }
    lines.push(line);
    currentLength += line.length + 1;
  }

  return lines.join("\n");
}
