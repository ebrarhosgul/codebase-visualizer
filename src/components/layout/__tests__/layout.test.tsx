import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { WorkspaceLayout } from "../workspace-layout";
import { ResizableSplitPane } from "../resizable-split-pane";
import { useWorkspaceStore } from "@/stores/workspace-store";

describe("ResizableSplitPane", () => {
  it("renders multiple panels with content", () => {
    render(
      <ResizableSplitPane
        panels={[
          { id: "p1", defaultSize: 30, content: <div>Panel 1</div> },
          { id: "p2", defaultSize: 70, content: <div>Panel 2</div> },
        ]}
      />,
    );

    expect(screen.getByText("Panel 1")).toBeInTheDocument();
    expect(screen.getByText("Panel 2")).toBeInTheDocument();
  });
});

describe("WorkspaceLayout", () => {
  beforeEach(() => {
    useWorkspaceStore.getState().resetLayout();
    useWorkspaceStore.getState().setSmallScreen(false);
    useWorkspaceStore.getState().setLeftSidebarCollapsed(false);
    useWorkspaceStore.getState().setRightPanelCollapsed(false);

    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  it("renders desktop three pane layout with left, center, and right content", () => {
    render(
      <WorkspaceLayout
        leftContent={<div>Tree Navigation</div>}
        centerContent={<div>Graph Canvas View</div>}
        rightContent={<div>Code Inspector View</div>}
      />,
    );

    expect(screen.getByText("Tree Navigation")).toBeInTheDocument();
    expect(screen.getByText("Graph Canvas View")).toBeInTheDocument();
    expect(screen.getByText("Code Inspector View")).toBeInTheDocument();
  });

  it("collapses left explorer and shows expand button", () => {
    render(
      <WorkspaceLayout
        leftContent={<div>Tree Navigation</div>}
        centerContent={<div>Graph Canvas View</div>}
        rightContent={<div>Code Inspector View</div>}
      />,
    );

    const collapseButton = screen.getByLabelText("Collapse explorer panel");
    fireEvent.click(collapseButton);

    expect(useWorkspaceStore.getState().isLeftSidebarCollapsed).toBe(true);
    expect(screen.getByLabelText("Expand explorer panel")).toBeInTheDocument();
  });

  it("collapses right inspector and shows expand button", () => {
    render(
      <WorkspaceLayout
        leftContent={<div>Tree Navigation</div>}
        centerContent={<div>Graph Canvas View</div>}
        rightContent={<div>Code Inspector View</div>}
      />,
    );

    const collapseButton = screen.getByLabelText("Collapse inspector panel");
    fireEvent.click(collapseButton);

    expect(useWorkspaceStore.getState().isRightPanelCollapsed).toBe(true);
    expect(screen.getByLabelText("Expand inspector panel")).toBeInTheDocument();
  });

  it("renders overlay drawers in small screen responsive mode", () => {
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    render(
      <WorkspaceLayout
        leftContent={<div>Mobile Tree Content</div>}
        centerContent={<div>Mobile Canvas Content</div>}
        rightContent={<div>Mobile Inspector Content</div>}
      />,
    );

    expect(screen.getByText("Mobile Canvas Content")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open repository tree drawer" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open inspector and code drawer" }),
    ).toBeInTheDocument();

    // Open left drawer
    fireEvent.click(
      screen.getByRole("button", { name: "Open repository tree drawer" }),
    );
    expect(screen.getByText("Mobile Tree Content")).toBeInTheDocument();

    // Close drawer
    fireEvent.click(screen.getByLabelText("Close navigation drawer"));
    expect(screen.queryByText("Mobile Tree Content")).not.toBeInTheDocument();
  });
});
