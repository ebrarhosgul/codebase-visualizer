import type { DemoIntent } from "./intents";

/**
 * Resolves user query prompt to a DemoIntent based on explicit hint or keyword priority.
 * Order: hint -> state_flow -> central_files -> layer_breakdown -> path_trace -> overview
 */
export function resolveDemoIntent(
  prompt: string,
  hint?: DemoIntent,
): DemoIntent {
  if (hint) {
    return hint;
  }

  const query = prompt.toLowerCase().trim();

  // 1. State flow
  const stateSubstrings = [
    "store",
    "stores",
    "zustand",
    "redux",
    "context provider",
    "global state",
  ];
  if (
    stateSubstrings.some((term) => query.includes(term)) ||
    /\bstate\b/i.test(query)
  ) {
    return "state_flow";
  }

  // 2. Central files / bottlenecks
  const centralSubstrings = [
    "central",
    "bottleneck",
    "most imported",
    "core module",
    "critical",
    "coupling",
    "fan in",
    "fan-in",
  ];
  if (
    centralSubstrings.some((term) => query.includes(term)) ||
    /\bhub\b/i.test(query)
  ) {
    return "central_files";
  }

  // 3. Layer breakdown
  const layerSubstrings = [
    "layer",
    "architecture",
    "structure",
    "breakdown",
    "organized",
    "organised",
  ];
  if (layerSubstrings.some((term) => query.includes(term))) {
    return "layer_breakdown";
  }

  // 4. Path trace
  const pathSubstrings = [
    "trace",
    "connect",
    "depends",
    "dependency",
    "between",
  ];
  if (
    pathSubstrings.some((term) => query.includes(term)) ||
    /\bpath\b/i.test(query) ||
    /\bflow\b/i.test(query)
  ) {
    return "path_trace";
  }

  // 5. Overview fallback
  return "overview";
}
