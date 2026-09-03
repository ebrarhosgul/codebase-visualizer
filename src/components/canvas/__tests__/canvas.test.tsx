import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ReactFlowProvider } from "@xyflow/react";
import { FileNodeCard } from "../file-node-card";
import { SymbolNodeCard } from "../symbol-node-card";
import { GraphControlsToolbar } from "../graph-controls-toolbar";
import { getMinimapNodeColor } from "../custom-minimap";
import type { NodeProps } from "@xyflow/react";
import type { CodebaseReactFlowNode } from "@/graph";

function renderWithProvider(ui: React.ReactElement) {
  return render(<ReactFlowProvider>{ui}</ReactFlowProvider>);
}

describe("FileNodeCard", () => {
  const baseNodeProps: NodeProps<CodebaseReactFlowNode> = {
    id: "file:src/index.ts",
    data: {
      entityType: "file",
      label: "index.ts",
      entity: {
        id: "file:src/index.ts",
        path: "src/index.ts",
        name: "index.ts",
        extension: "ts",
        language: "typescript",
        sizeBytes: 3400,
        lineCount: 120,
        directoryId: "dir:src",
        symbolIds: ["symbol:src/index.ts#main"],
        importIds: [],
        exportIds: [],
      },
    },
    selected: false,
    type: "file",
    zIndex: 1,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    dragging: false,
    selectable: true,
    deletable: false,
    draggable: true,
  };

  it("renders file name and syntax badge", () => {
    renderWithProvider(<FileNodeCard {...baseNodeProps} />);
    expect(screen.getByText("index.ts")).toBeInTheDocument();
    expect(screen.getByText(".ts")).toBeInTheDocument();
    expect(screen.getByText("src/index.ts")).toBeInTheDocument();
  });

  it("toggles file details on button click", () => {
    renderWithProvider(<FileNodeCard {...baseNodeProps} />);
    expect(screen.queryByText("Symbols:")).not.toBeInTheDocument();

    const toggleButton = screen.getByRole("button", { name: "Show details" });
    fireEvent.click(toggleButton);

    expect(screen.getByText("Symbols:")).toBeInTheDocument();
    expect(screen.getByText("Hide details")).toBeInTheDocument();
  });

  it("applies focus ring when selected", () => {
    const { container } = renderWithProvider(
      <FileNodeCard {...baseNodeProps} selected={true} />,
    );
    const card = container.querySelector("[role='article']");
    expect(card?.className).toContain("ring-2");
  });

  it("renders directory node correctly", () => {
    const dirProps: NodeProps<CodebaseReactFlowNode> = {
      ...baseNodeProps,
      id: "dir:src",
      data: {
        entityType: "directory",
        label: "src",
        entity: {
          id: "dir:src",
          path: "src",
          name: "src",
          parentDirId: null,
          childDirIds: [],
          childFileIds: [],
        },
      },
    };

    renderWithProvider(<FileNodeCard {...dirProps} />);
    expect(screen.getAllByText("src")).toHaveLength(2);
    expect(screen.getByText("dir")).toBeInTheDocument();
  });
});

describe("SymbolNodeCard", () => {
  const symbolProps: NodeProps<CodebaseReactFlowNode> = {
    id: "symbol:src/index.ts#buildGraph",
    data: {
      entityType: "symbol",
      label: "buildGraph",
      entity: {
        id: "symbol:src/index.ts#buildGraph",
        fileId: "file:src/index.ts",
        parentSymbolId: null,
        name: "buildGraph",
        kind: "function",
        range: {
          startOffset: 0,
          endOffset: 50,
          startLine: 1,
          startColumn: 1,
          endLine: 5,
          endColumn: 2,
        },
        selectionRange: {
          startOffset: 0,
          endOffset: 10,
          startLine: 1,
          startColumn: 1,
          endLine: 1,
          endColumn: 11,
        },
        isExported: true,
        isDefaultExport: false,
        signature: "export function buildGraph(): CodebaseGraph",
        documentation: "Builds graph",
        visibility: "public",
        childSymbolIds: [],
      },
    },
    selected: false,
    type: "symbol",
    zIndex: 1,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    dragging: false,
    selectable: true,
    deletable: false,
    draggable: true,
  };

  it("renders function symbol with signature and exported badge", () => {
    renderWithProvider(<SymbolNodeCard {...symbolProps} />);
    expect(screen.getByText("buildGraph")).toBeInTheDocument();
    expect(screen.getByText("function")).toBeInTheDocument();
    expect(screen.getByText("public")).toBeInTheDocument();
  });
});

describe("GraphControlsToolbar", () => {
  it("handles zoom and minimap interactions", () => {
    const handleZoomIn = vi.fn();
    const handleZoomOut = vi.fn();
    const handleFitView = vi.fn();
    const handleToggleMinimap = vi.fn();

    render(
      <GraphControlsToolbar
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onFitView={handleFitView}
        isMinimapVisible={false}
        onToggleMinimap={handleToggleMinimap}
        currentZoom={1.25}
      />,
    );

    expect(screen.getByText("125%")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(handleZoomIn).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(handleZoomOut).toHaveBeenCalledTimes(1);

    fireEvent.click(
      screen.getByRole("button", { name: "Fit entire graph in view" }),
    );
    expect(handleFitView).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Show minimap" }));
    expect(handleToggleMinimap).toHaveBeenCalledTimes(1);
  });
});

describe("getMinimapNodeColor", () => {
  it("maps entity types to semantic theme colors", () => {
    expect(
      getMinimapNodeColor({
        id: "1",
        position: { x: 0, y: 0 },
        data: { entityType: "file" },
      }),
    ).toBe("#38bdf8");
    expect(
      getMinimapNodeColor({
        id: "2",
        position: { x: 0, y: 0 },
        data: { entityType: "symbol" },
      }),
    ).toBe("#a78bfa");
    expect(
      getMinimapNodeColor({
        id: "3",
        position: { x: 0, y: 0 },
        data: { entityType: "directory" },
      }),
    ).toBe("#64748b");
    expect(
      getMinimapNodeColor({
        id: "4",
        position: { x: 0, y: 0 },
        data: { entityType: "external" },
      }),
    ).toBe("#f59e0b");
  });
});
