import type { DemoPromptChip } from "./types";

/**
 * The standard catalog of 3 demo prompt chips offered in zero-friction demo mode.
 */
export const DEMO_PROMPT_CHIPS: readonly DemoPromptChip[] = Object.freeze([
  Object.freeze({
    id: "layer-breakdown",
    label: "Architecture & layer breakdown",
    description:
      "Layer counts, strongest cross layer imports, and inverted dependencies",
    intent: "layer_breakdown",
    promptText:
      "Give me an architecture and layer breakdown of this repository",
  }),
  Object.freeze({
    id: "central-files",
    label: "Core bottleneck / central files",
    description: "Top files by fan in, ranked from the import graph",
    intent: "central_files",
    promptText: "Which files are the core bottlenecks or most central modules?",
  }),
  Object.freeze({
    id: "state-flow",
    label: "State management flow",
    description: "Store modules and what imports them, two hops out",
    intent: "state_flow",
    promptText: "How does state management flow through this codebase?",
  }),
]);
