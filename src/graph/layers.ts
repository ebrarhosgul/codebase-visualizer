import type { CodebaseGraph } from "@/entities";

export type ArchitecturalLayerId =
  | "components"
  | "hooks"
  | "stores"
  | "entities"
  | "lib"
  | "api"
  | "utils"
  | "app"
  | "other";

export interface ArchitecturalLayer {
  readonly id: ArchitecturalLayerId;
  readonly label: string;
  readonly color: string;
  readonly patterns: readonly string[];
  readonly rank: number;
}

export const ARCHITECTURAL_LAYERS: readonly ArchitecturalLayer[] =
  Object.freeze([
    Object.freeze({
      id: "components",
      label: "Components",
      color: "#3b82f6",
      patterns: Object.freeze(["components", "ui", "views", "widgets"]),
      rank: 1,
    }),
    Object.freeze({
      id: "hooks",
      label: "Hooks",
      color: "#06b6d4",
      patterns: Object.freeze(["hooks", "composables"]),
      rank: 2,
    }),
    Object.freeze({
      id: "stores",
      label: "Stores",
      color: "#a855f7",
      patterns: Object.freeze(["stores", "state", "context", "slices"]),
      rank: 3,
    }),
    Object.freeze({
      id: "entities",
      label: "Entities",
      color: "#10b981",
      patterns: Object.freeze(["entities", "models", "types", "schemas"]),
      rank: 4,
    }),
    Object.freeze({
      id: "lib",
      label: "Library",
      color: "#f59e0b",
      patterns: Object.freeze(["lib", "services", "core", "sdk"]),
      rank: 5,
    }),
    Object.freeze({
      id: "api",
      label: "API & Server",
      color: "#f43f5e",
      patterns: Object.freeze(["api", "server", "routes", "controllers"]),
      rank: 6,
    }),
    Object.freeze({
      id: "utils",
      label: "Utilities",
      color: "#64748b",
      patterns: Object.freeze(["utils", "helpers", "shared", "common"]),
      rank: 7,
    }),
    Object.freeze({
      id: "app",
      label: "Application",
      color: "#6366f1",
      patterns: Object.freeze(["app", "pages", "layouts"]),
      rank: 8,
    }),
    Object.freeze({
      id: "other",
      label: "Other",
      color: "#71717a",
      patterns: Object.freeze([]),
      rank: 9,
    }),
  ]);

const LAYER_MAP = new Map<ArchitecturalLayerId, ArchitecturalLayer>(
  ARCHITECTURAL_LAYERS.map((layer) => [layer.id, layer]),
);

/**
 * Returns the layer definition by its identifier.
 */
export function getLayerDefinition(
  layerId: ArchitecturalLayerId,
): ArchitecturalLayer {
  const found = LAYER_MAP.get(layerId);
  if (found) {
    return found;
  }
  return ARCHITECTURAL_LAYERS[ARCHITECTURAL_LAYERS.length - 1];
}

/**
 * Classifies a file path into its standardized architectural layer.
 * Evaluates lowercase path segments against taxonomy patterns by priority rank.
 */
export function classifyLayerForPath(filePath: string): ArchitecturalLayerId {
  const normalized = filePath
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .toLowerCase();

  const segments = normalized.split("/");

  // Check specific API route pattern: app/api/... should classify as api
  if (
    segments.includes("api") ||
    segments.includes("server") ||
    segments.includes("controllers")
  ) {
    return "api";
  }

  // Iterate layers by priority rank 1 through 8
  for (const layer of ARCHITECTURAL_LAYERS) {
    if (layer.id === "other" || layer.id === "api") {
      continue;
    }

    for (const segment of segments) {
      if (layer.patterns.includes(segment)) {
        return layer.id;
      }
    }
  }

  return "other";
}

/**
 * Discovers all active architectural layers present across files in the codebase graph.
 * Returns unique layers ordered by priority rank.
 */
export function classifyArchitecturalLayers(
  graph: CodebaseGraph | null,
): readonly ArchitecturalLayer[] {
  if (!graph || Object.keys(graph.files).length === 0) {
    return Object.freeze([]);
  }

  const discoveredLayerIds = new Set<ArchitecturalLayerId>();

  for (const file of Object.values(graph.files)) {
    const layerId = classifyLayerForPath(file.path);
    discoveredLayerIds.add(layerId);
  }

  return Object.freeze(
    ARCHITECTURAL_LAYERS.filter((layer) => discoveredLayerIds.has(layer.id)),
  );
}
