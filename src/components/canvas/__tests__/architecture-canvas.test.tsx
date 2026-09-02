import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { ArchitectureCanvas } from "../architecture-canvas";
import { useGraphStore } from "@/stores/graph-store";
import type { CodebaseGraph } from "@/entities";

describe("ArchitectureCanvas", () => {
  beforeEach(() => {
    useGraphStore.getState().reset();
  });

  it("renders empty canvas welcome state when no graph is loaded", () => {
    render(<ArchitectureCanvas />);
    expect(screen.getByTestId("canvas-empty-state")).toBeInTheDocument();
    expect(screen.getByText("Architecture Graph Canvas")).toBeInTheDocument();
  });

  it("renders interactive React Flow canvas when graph is loaded in store", () => {
    const mockGraph = {
      schemaVersion: 1,
      repository: {
        id: "repo:org/app",
        owner: "org",
        name: "app",
        fullName: "org/app",
        defaultBranch: "main",
        commitSha: "sha1",
        analyzedAt: new Date().toISOString(),
        totalFiles: 1,
        totalSymbols: 0,
        languages: { typescript: 1 },
        schemaVersion: 1,
      },
      directories: {},
      files: {
        "file:src/main.ts": {
          id: "file:src/main.ts",
          path: "src/main.ts",
          name: "main.ts",
          extension: ".ts",
          language: "typescript",
          sizeBytes: 200,
          lineCount: 15,
          directoryId: "dir:src",
          symbolIds: [],
          importIds: [],
          exportIds: [],
        },
      },
      symbols: {},
      externalModules: {},
      edges: {},
    } as unknown as CodebaseGraph;

    useGraphStore.getState().setGraph(mockGraph);

    render(<ArchitectureCanvas />);
    expect(screen.getByTestId("architecture-canvas")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zoom in" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Fit entire graph in view" }),
    ).toBeInTheDocument();
  });
});
