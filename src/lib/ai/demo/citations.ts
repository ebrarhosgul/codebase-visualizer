import type { CitationRef } from "@/lib/ai/types";
import { DEMO_MAX_CITATIONS } from "./limits";

/**
 * Creates a standard CitationRef for demo answers pointing to line 1 of a file.
 */
export function createDemoCitation(
  fileId: string,
  filePath: string,
): CitationRef {
  return {
    id: `cite:${fileId}_1`,
    fileId,
    line: 1,
    column: null,
    label: filePath,
    snippet: null,
  };
}

/**
 * Deduplicates citations by fileId, preserving insertion order and capping at limit.
 */
export function deduplicateCitations(
  citations: readonly CitationRef[],
  limit = DEMO_MAX_CITATIONS,
): readonly CitationRef[] {
  const seen = new Set<string>();
  const result: CitationRef[] = [];

  for (const cite of citations) {
    if (!seen.has(cite.fileId)) {
      seen.add(cite.fileId);
      result.push(cite);
      if (result.length >= limit) {
        break;
      }
    }
  }

  return Object.freeze(result);
}
