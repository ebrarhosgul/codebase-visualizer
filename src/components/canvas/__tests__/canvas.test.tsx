import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ReactFlowProvider } from "@xyflow/react";
import { FileNodeCard } from "../file-node-card";
import { SymbolNodeCard } from "../symbol-node-card";
import { GraphControlsToolbar } from "../graph-controls-toolbar";
import { getMinimapNodeColor } from "../custom-minimap";
import { useGraphStore } from "@/stores/graph-store";
import type { NodeProps } from "@xyflow/react";
import type { CodebaseReactFlowNode } from "@/graph";
import type { FileNode, SymbolNode } from "@/entities";

function renderWithProvider(ui: React.ReactElement) {
  return render(<ReactFlowProvider>{ui}</ReactFlowProvider>);
}

const mockFileEntity: FileNode = {
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
};

describe("FileNodeCard", () => {
  const baseNodeProps: NodeProps<CodebaseReactFlowNode> = {
    id: "file:src/index.ts",
    data: {
      entityType: "file",
      label: "index.ts",
      entity: mockFileEntity,
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

  it("enforces fixed 240px width and truncates long labels without overflowing", () => {
    const longNameProps: NodeProps<CodebaseReactFlowNode> = {
      ...baseNodeProps,
      id: "file:src/very-long-feature-component-controller-name-that-would-overflow.tsx",
      data: {
        entityType: "file",
        label:
          "very-long-feature-component-controller-name-that-would-overflow.tsx",
        entity: {
          ...mockFileEntity,
          name: "very-long-feature-component-controller-name-that-would-overflow.tsx",
          path: "src/very-long-feature-component-controller-name-that-would-overflow.tsx",
        },
      },
    };

    const { container } = renderWithProvider(
      <FileNodeCard {...longNameProps} />,
    );
    const card = container.querySelector("[role='article']");
    expect(card?.className).toContain("w-[240px]");
    expect(card?.className).toContain("max-w-[240px]");

    const titleEl = screen.getByRole("heading", { level: 4 });
    expect(titleEl.className).toContain("truncate");
    expect(titleEl).toHaveAttribute(
      "title",
      "very-long-feature-component-controller-name-that-would-overflow.tsx",
    );
  });

  beforeEach(() => {
    useGraphStore.getState().reset();
  });

  it("applies hovered styling when node is hovered in store (AC-2)", () => {
    renderWithProvider(<FileNodeCard {...baseNodeProps} />);

    act(() => {
      useGraphStore.getState().setHoveredNodeId("file:src/index.ts");
    });

    const card = screen.getByRole("article", {
      name: "file node: index.ts",
    });
    expect(card.className).toContain("border-border-strong");
    expect(card.className).toContain("bg-surface-card/90");
  });

  it("applies dimmed styling when node is dimmed and not hovered or selected", () => {
    const dimmedProps: NodeProps<CodebaseReactFlowNode> = {
      ...baseNodeProps,
      data: {
        ...baseNodeProps.data,
        isDimmed: true,
      } as unknown as CodebaseReactFlowNode["data"],
    };

    renderWithProvider(<FileNodeCard {...dimmedProps} />);
    const card = screen.getByRole("article", {
      name: "file node: index.ts",
    });
    expect(card.className).toContain("opacity-25");
  });

  it("applies connected styling when node is marked connected", () => {
    const connectedProps: NodeProps<CodebaseReactFlowNode> = {
      ...baseNodeProps,
      data: {
        ...baseNodeProps.data,
        isConnected: true,
      } as unknown as CodebaseReactFlowNode["data"],
    };

    renderWithProvider(<FileNodeCard {...connectedProps} />);
    const card = screen.getByRole("article", {
      name: "file node: index.ts",
    });
    expect(card.className).toContain("border-border-strong");
  });

  it("renders external package node with pkg badge", () => {
    const externalProps: NodeProps<CodebaseReactFlowNode> = {
      ...baseNodeProps,
      id: "ext:react",
      data: {
        entityType: "external",
        label: "react",
        entity: {
          id: "ext:react",
          name: "react",
          isExternal: true,
        },
      },
    };

    renderWithProvider(<FileNodeCard {...externalProps} />);
    expect(screen.getByText("react")).toBeInTheDocument();
    expect(screen.getByText("pkg")).toBeInTheDocument();
    expect(screen.getByText("external package")).toBeInTheDocument();
  });
});

const mockSymbolEntity: SymbolNode = {
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
};

describe("SymbolNodeCard", () => {
  const symbolProps: NodeProps<CodebaseReactFlowNode> = {
    id: "symbol:src/index.ts#buildGraph",
    data: {
      entityType: "symbol",
      label: "buildGraph",
      entity: mockSymbolEntity,
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

  it("enforces fixed 240px width and truncates long symbol names", () => {
    const longSymbolProps: NodeProps<CodebaseReactFlowNode> = {
      ...symbolProps,
      data: {
        entityType: "symbol",
        label: "useExtremelyLongCustomHookWithMultipleGenericsAndStateHandlers",
        entity: {
          ...mockSymbolEntity,
          name: "useExtremelyLongCustomHookWithMultipleGenericsAndStateHandlers",
        },
      },
    };

    const { container } = renderWithProvider(
      <SymbolNodeCard {...longSymbolProps} />,
    );
    const card = container.querySelector("[role='article']");
    expect(card?.className).toContain("w-[240px]");
    expect(card?.className).toContain("max-w-[240px]");

    const titleEl = screen.getByRole("heading", { level: 4 });
    expect(titleEl.className).toContain("truncate");
  });

  it("applies hovered styling when symbol is hovered in store (AC-2)", () => {
    renderWithProvider(<SymbolNodeCard {...symbolProps} />);

    act(() => {
      useGraphStore
        .getState()
        .setHoveredNodeId("symbol:src/index.ts#buildGraph");
    });

    const card = screen.getByRole("article", {
      name: "Symbol node: buildGraph (function)",
    });
    expect(card.className).toContain("border-border-strong");
    expect(card.className).toContain("bg-surface-card/90");
  });

  it("renders class and interface symbols with matching badge variants", () => {
    const classSymbol: NodeProps<CodebaseReactFlowNode> = {
      ...symbolProps,
      id: "symbol:src/index.ts#GraphService",
      data: {
        entityType: "symbol",
        label: "GraphService",
        entity: {
          ...mockSymbolEntity,
          id: "symbol:src/index.ts#GraphService",
          name: "GraphService",
          kind: "class",
        },
      },
    };

    const { unmount } = renderWithProvider(<SymbolNodeCard {...classSymbol} />);
    expect(screen.getByText("class")).toBeInTheDocument();
    unmount();

    const interfaceSymbol: NodeProps<CodebaseReactFlowNode> = {
      ...symbolProps,
      id: "symbol:src/index.ts#GraphConfig",
      data: {
        entityType: "symbol",
        label: "GraphConfig",
        entity: {
          ...mockSymbolEntity,
          id: "symbol:src/index.ts#GraphConfig",
          name: "GraphConfig",
          kind: "interface",
        },
      },
    };

    renderWithProvider(<SymbolNodeCard {...interfaceSymbol} />);
    expect(screen.getByText("interface")).toBeInTheDocument();
  });

  it("renders empty element when entityType is not symbol", () => {
    const invalidProps = {
      ...symbolProps,
      data: {
        entityType: "file",
      },
    } as unknown as NodeProps<CodebaseReactFlowNode>;

    renderWithProvider(<SymbolNodeCard {...invalidProps} />);
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });

  it("omits exported section when symbol is not exported", () => {
    const unexportedProps: NodeProps<CodebaseReactFlowNode> = {
      ...symbolProps,
      data: {
        entityType: "symbol",
        label: "buildGraph",
        entity: {
          ...mockSymbolEntity,
          isExported: false,
        },
      },
    };

    renderWithProvider(<SymbolNodeCard {...unexportedProps} />);
    expect(screen.queryByText("exported")).not.toBeInTheDocument();
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
