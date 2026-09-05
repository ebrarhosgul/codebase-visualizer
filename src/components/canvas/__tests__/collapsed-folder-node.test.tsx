import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReactFlowProvider, type NodeProps } from "@xyflow/react";
import { CollapsedFolderNode } from "../collapsed-folder-node";
import { useGraphStore } from "@/stores/graph-store";

function renderWithProvider(ui: React.ReactElement) {
  return render(<ReactFlowProvider>{ui}</ReactFlowProvider>);
}

describe("CollapsedFolderNode Component", () => {
  beforeEach(() => {
    useGraphStore.getState().reset();
  });

  const mockProps: NodeProps = {
    id: "folder-group:src/components",
    data: {
      label: "src/components",
      fileCount: 4,
      dominantLayerId: "components",
      externalImportCount: 3,
      externalExportCount: 5,
    },
    selected: false,
    selectable: false,
    deletable: false,
    draggable: false,
    type: "collapsedFolder",
    zIndex: 1,
    isConnectable: false,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    dragging: false,
  };

  it("renders folder label, file count, dominant layer badge, and external counters (AC-4)", () => {
    renderWithProvider(<CollapsedFolderNode {...mockProps} />);

    expect(screen.getByText("src/components")).toBeInTheDocument();
    expect(screen.getByText("4 files")).toBeInTheDocument();
    expect(screen.getByText("Components")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("triggers toggleFolderCollapse on expand button click (AC-4, AC-5)", () => {
    renderWithProvider(<CollapsedFolderNode {...mockProps} />);

    const expandBtn = screen.getByTestId("folder-expand-src/components");
    fireEvent.click(expandBtn);

    expect(useGraphStore.getState().collapsedFolderIds).toEqual([
      "src/components",
    ]);
  });

  it("triggers toggleFolderCollapse on double click (AC-4, AC-5)", () => {
    renderWithProvider(<CollapsedFolderNode {...mockProps} />);

    const card = screen.getByTestId("collapsed-folder-src/components");
    fireEvent.doubleClick(card);

    expect(useGraphStore.getState().collapsedFolderIds).toEqual([
      "src/components",
    ]);
  });

  it("selects node in store on single click (AC-7)", () => {
    renderWithProvider(<CollapsedFolderNode {...mockProps} />);

    const card = screen.getByTestId("collapsed-folder-src/components");
    fireEvent.click(card);

    expect(useGraphStore.getState().selectedNodeId).toBe(
      "folder-group:src/components",
    );
  });

  it("formats singular file label when fileCount is 1 (AC-4)", () => {
    const singleFileProps: NodeProps = {
      ...mockProps,
      data: {
        ...mockProps.data,
        fileCount: 1,
      },
    };

    renderWithProvider(<CollapsedFolderNode {...singleFileProps} />);
    expect(screen.getByText("1 file")).toBeInTheDocument();
  });
});
