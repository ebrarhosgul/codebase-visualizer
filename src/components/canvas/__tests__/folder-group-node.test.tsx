import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { NodeProps } from "@xyflow/react";
import { FolderGroupNode } from "../folder-group-node";
import { useGraphStore } from "@/stores/graph-store";

describe("FolderGroupNode Component", () => {
  beforeEach(() => {
    useGraphStore.getState().reset();
  });

  const mockProps: NodeProps = {
    id: "folder-group:src/components",
    data: {
      label: "src/components",
      fileCount: 3,
      hasActiveChild: false,
      isHighlighted: false,
    },
    selected: false,
    selectable: false,
    deletable: false,
    draggable: false,
    type: "folderGroup",
    zIndex: 0,
    isConnectable: false,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    dragging: false,
  };

  it("renders folder label and file count badge (AC-4)", () => {
    render(<FolderGroupNode {...mockProps} />);

    expect(screen.getByText("src/components")).toBeInTheDocument();
    expect(screen.getByText("3 files")).toBeInTheDocument();
  });

  it("triggers toggleFolderCollapse when chevron button is clicked (AC-5)", () => {
    render(<FolderGroupNode {...mockProps} />);

    const chevronBtn = screen.getByTestId("folder-collapse-src/components");
    fireEvent.click(chevronBtn);

    expect(useGraphStore.getState().collapsedFolderIds).toEqual([
      "src/components",
    ]);
  });

  it("triggers toggleFolderCollapse on header double click (AC-5)", () => {
    render(<FolderGroupNode {...mockProps} />);

    const header = screen.getByTitle(
      "Double click or click chevron to collapse folder",
    );
    fireEvent.doubleClick(header);

    expect(useGraphStore.getState().collapsedFolderIds).toEqual([
      "src/components",
    ]);
  });

  it("applies active styling when hasActiveChild is true (AC-5)", () => {
    const activeProps: NodeProps = {
      ...mockProps,
      data: {
        ...mockProps.data,
        hasActiveChild: true,
      },
    };

    render(<FolderGroupNode {...activeProps} />);

    const container = screen.getByTestId("folder-group-src/components");
    expect(container.className).toContain("border-2");
  });

  it("provides accessible label on collapse trigger button (AC-5, a11y)", () => {
    render(<FolderGroupNode {...mockProps} />);

    expect(
      screen.getByRole("button", { name: "Collapse src/components folder" }),
    ).toBeInTheDocument();
  });
});
