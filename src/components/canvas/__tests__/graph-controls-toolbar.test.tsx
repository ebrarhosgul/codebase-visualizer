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
});
