import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DemoAnswerFooter } from "../demo-answer-footer";

describe("DemoAnswerFooter", () => {
  it("states that the answer is computed from the graph with no AI model (covers: AC-8)", () => {
    render(<DemoAnswerFooter onAddKey={vi.fn()} />);

    expect(
      screen.getByText(
        "Computed from the loaded dependency graph, no AI model involved.",
      ),
    ).toBeInTheDocument();
  });

  it("calls onAddKey when Add your own key is clicked (covers: AC-8)", async () => {
    const onAddKey = vi.fn();
    render(<DemoAnswerFooter onAddKey={onAddKey} />);

    fireEvent.click(screen.getByRole("button", { name: "Add your own key" }));

    expect(onAddKey).toHaveBeenCalledTimes(1);
  });

  it("renders Add your own key as a button, not a link (covers: AC-8)", () => {
    render(<DemoAnswerFooter onAddKey={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: "Add your own key" }),
    ).toHaveAttribute("type", "button");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  describe("hidden cited files notice", () => {
    it("shows the plural message with a Show all button (covers: AC-7)", async () => {
      const onShowAll = vi.fn();
      render(
        <DemoAnswerFooter
          hiddenCount={2}
          isMostRecentAnswer
          onShowAll={onShowAll}
          onAddKey={vi.fn()}
        />,
      );

      expect(
        screen.getByText("2 cited files are hidden by current filters"),
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Show all" }));
      expect(onShowAll).toHaveBeenCalledTimes(1);
    });

    it("uses the singular message when exactly one file is hidden (covers: AC-7)", () => {
      render(
        <DemoAnswerFooter
          hiddenCount={1}
          isMostRecentAnswer
          onShowAll={vi.fn()}
          onAddKey={vi.fn()}
        />,
      );

      expect(
        screen.getByText("1 cited file is hidden by current filters"),
      ).toBeInTheDocument();
      expect(screen.queryByText(/1 cited files/)).not.toBeInTheDocument();
    });

    it("shows no notice when nothing is hidden (covers: AC-7)", () => {
      render(
        <DemoAnswerFooter
          hiddenCount={0}
          isMostRecentAnswer
          onShowAll={vi.fn()}
          onAddKey={vi.fn()}
        />,
      );

      expect(screen.queryByText(/hidden by current filters/)).toBeNull();
      expect(screen.queryByRole("button", { name: "Show all" })).toBeNull();
    });

    it("suppresses the notice while the layout is still calculating so a stale count is never shown (covers: AC-7)", () => {
      render(
        <DemoAnswerFooter
          hiddenCount={3}
          isMostRecentAnswer
          isCalculatingLayout
          onShowAll={vi.fn()}
          onAddKey={vi.fn()}
        />,
      );

      expect(screen.queryByText(/hidden by current filters/)).toBeNull();
      expect(screen.queryByRole("button", { name: "Show all" })).toBeNull();
    });

    it("shows the notice only under the most recent answer (covers: AC-7)", () => {
      render(
        <DemoAnswerFooter
          hiddenCount={3}
          isMostRecentAnswer={false}
          onShowAll={vi.fn()}
          onAddKey={vi.fn()}
        />,
      );

      expect(screen.queryByText(/hidden by current filters/)).toBeNull();
    });

    it("shows no notice when no Show all handler is provided", () => {
      render(
        <DemoAnswerFooter
          hiddenCount={3}
          isMostRecentAnswer
          onAddKey={vi.fn()}
        />,
      );

      expect(screen.queryByText(/hidden by current filters/)).toBeNull();
    });

    it("keeps the attribution footer visible even when the notice is hidden (covers: AC-8)", () => {
      render(
        <DemoAnswerFooter
          hiddenCount={3}
          isMostRecentAnswer
          isCalculatingLayout
          onShowAll={vi.fn()}
          onAddKey={vi.fn()}
        />,
      );

      expect(screen.getByText(/no AI model involved/)).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Add your own key" }),
      ).toBeInTheDocument();
    });
  });
});
