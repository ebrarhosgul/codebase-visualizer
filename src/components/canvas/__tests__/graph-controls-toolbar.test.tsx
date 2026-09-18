import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { GraphControlsToolbar } from "../graph-controls-toolbar";

describe("GraphControlsToolbar", () => {
  const defaultProps = {
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onFitView: vi.fn(),
    isMinimapVisible: true,
    onToggleMinimap: vi.fn(),
  };

  it("renders zoom controls and minimap button", () => {
    render(<GraphControlsToolbar {...defaultProps} />);

    expect(screen.getByRole("button", { name: "Zoom in" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Zoom out" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Fit entire graph in view" }),
    ).toBeInTheDocument();
  });

  it("renders layout calculating indicator when isCalculatingLayout is true (AC-4)", () => {
    render(
      <GraphControlsToolbar {...defaultProps} isCalculatingLayout={true} />,
    );

    const indicator = screen.getByTestId("layout-calculating-indicator");
    expect(indicator).toBeInTheDocument();
    expect(screen.getByText("Calculating layout")).toBeInTheDocument();
  });

  it("does not render layout calculating indicator when isCalculatingLayout is false", () => {
    render(
      <GraphControlsToolbar {...defaultProps} isCalculatingLayout={false} />,
    );

    expect(
      screen.queryByTestId("layout-calculating-indicator"),
    ).not.toBeInTheDocument();
  });

  it("exposes accessible toolbar semantics and live zoom percentage", () => {
    render(<GraphControlsToolbar {...defaultProps} currentZoom={1.25} />);

    expect(
      screen.getByRole("toolbar", { name: "Canvas zoom and view controls" }),
    ).toBeInTheDocument();
    expect(screen.getByText("125%")).toBeInTheDocument();
  });

  it("triggers reset view callback when reset button is clicked", () => {
    const onResetView = vi.fn();
    render(
      <GraphControlsToolbar {...defaultProps} onResetView={onResetView} />,
    );

    const resetBtn = screen.getByRole("button", {
      name: "Reset view to default position",
    });
    resetBtn.click();
    expect(onResetView).toHaveBeenCalledTimes(1);
  });

  it("handles follow cursor and minimap state toggles", () => {
    const onToggleFollowCursor = vi.fn();
    const onToggleMinimap = vi.fn();

    const { rerender } = render(
      <GraphControlsToolbar
        {...defaultProps}
        isMinimapVisible={false}
        onToggleMinimap={onToggleMinimap}
        isFollowCursorActive={false}
        onToggleFollowCursor={onToggleFollowCursor}
      />,
    );

    const followBtn = screen.getByRole("button", {
      name: /Follow code cursor \(paused/i,
    });
    followBtn.click();
    expect(onToggleFollowCursor).toHaveBeenCalledTimes(1);

    const minimapBtn = screen.getByRole("button", { name: "Show minimap" });
    minimapBtn.click();
    expect(onToggleMinimap).toHaveBeenCalledTimes(1);

    rerender(
      <GraphControlsToolbar
        {...defaultProps}
        isMinimapVisible={true}
        onToggleMinimap={onToggleMinimap}
        isFollowCursorActive={true}
        onToggleFollowCursor={onToggleFollowCursor}
      />,
    );

    expect(
      screen.getByRole("button", {
        name: /Follow code cursor \(active/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Hide minimap" }),
    ).toBeInTheDocument();
  });
});
