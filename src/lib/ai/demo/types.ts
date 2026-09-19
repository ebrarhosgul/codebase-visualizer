import type { CitationRef } from "@/lib/ai/types";
import type { PathTrace } from "@/entities";
import type { DemoIntent } from "./intents";

/**
 * Metadata defining a demo prompt chip.
 */
export interface DemoPromptChip {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly intent: DemoIntent;
  readonly promptText: string;
}

/**
 * Structured heuristic answer computed from graph metrics prior to streaming.
 */
export interface DemoAnswer {
  readonly intent: DemoIntent;
  readonly markdown: string;
  readonly citations: readonly CitationRef[];
  readonly highlightNodeIds: readonly string[];
  readonly trace: PathTrace | null;
  readonly warning?: string | null;
  readonly isFallback: boolean;
}
