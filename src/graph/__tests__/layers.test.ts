import { describe, it, expect } from "vitest";
import {
  classifyLayerForPath,
  classifyArchitecturalLayers,
  getLayerDefinition,
  ARCHITECTURAL_LAYERS,
} from "../layers";
import type { CodebaseGraph, FileNode } from "@/entities";

describe("Architectural Layer Taxonomy and Classification", () => {
  it("classifies path segments into appropriate architectural layers", () => {
    expect(classifyLayerForPath("src/components/button.tsx")).toBe(
      "components",
    );
    expect(classifyLayerForPath("src/ui/card.tsx")).toBe("components");
    expect(classifyLayerForPath("src/hooks/use-auth.ts")).toBe("hooks");
    expect(classifyLayerForPath("src/stores/graph-store.ts")).toBe("stores");
    expect(classifyLayerForPath("src/entities/file.ts")).toBe("entities");
    expect(classifyLayerForPath("src/lib/parser.ts")).toBe("lib");
    expect(classifyLayerForPath("src/app/api/ingest/route.ts")).toBe("api");
    expect(classifyLayerForPath("src/server/handlers.ts")).toBe("api");
    expect(classifyLayerForPath("src/utils/format.ts")).toBe("utils");
    expect(classifyLayerForPath("src/app/page.tsx")).toBe("app");
    expect(classifyLayerForPath("scripts/generate.js")).toBe("other");
  });

  it("retrieves layer definition with color and priority rank", () => {
    expect(ARCHITECTURAL_LAYERS.length).toBe(9);
    const compLayer = getLayerDefinition("components");
    expect(compLayer.label).toBe("Components");
    expect(compLayer.color).toBe("#3b82f6");
    expect(compLayer.rank).toBe(1);

    const fallback = getLayerDefinition("other");
    expect(fallback.id).toBe("other");
    expect(fallback.rank).toBe(9);
  });

  it("discovers present architectural layers in graph ordered by rank", () => {
    const mockGraph = {
      files: {
        "file:1": { id: "file:1", path: "src/utils/date.ts" } as FileNode,
        "file:2": {
          id: "file:2",
          path: "src/components/badge.tsx",
        } as FileNode,
        "file:3": { id: "file:3", path: "src/hooks/use-theme.ts" } as FileNode,
      },
    } as unknown as CodebaseGraph;

    const layers = classifyArchitecturalLayers(mockGraph);
    expect(layers.map((l) => l.id)).toEqual(["components", "hooks", "utils"]);
  });

  it("returns empty array for null or empty graph", () => {
    expect(classifyArchitecturalLayers(null)).toEqual([]);
    expect(
      classifyArchitecturalLayers({ files: {} } as unknown as CodebaseGraph),
    ).toEqual([]);
  });
});
