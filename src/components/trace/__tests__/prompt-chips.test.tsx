import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PromptChips } from "../prompt-chips";
import { DEMO_PROMPT_CHIPS } from "@/lib/ai/demo/chips";

describe("PromptChips", () => {
  describe("empty variant", () => {
    it("renders every chip label with its description (covers: AC-11)", () => {
      render(
        <PromptChips
          chips={DEMO_PROMPT_CHIPS}
          variant="empty"
          disabled={false}
          onSelect={vi.fn()}
        />,
      );

      for (const chip of DEMO_PROMPT_CHIPS) {
        expect(screen.getByText(chip.label)).toBeInTheDocument();
        expect(screen.getByText(chip.description)).toBeInTheDocument();
      }
      expect(screen.getAllByRole("button")).toHaveLength(3);
    });

    it("links each chip to its description through aria-describedby (covers: AC-11)", () => {
      render(
        <PromptChips
          chips={DEMO_PROMPT_CHIPS}
          variant="empty"
          disabled={false}
          onSelect={vi.fn()}
        />,
      );

      const button = screen.getByRole("button", {
        name: /Core bottleneck \/ central files/,
      });
      expect(button).toHaveAccessibleDescription(
        "Top files by fan in, ranked from the import graph",
      );
    });

    it("calls onSelect with the clicked chip (covers: AC-1)", async () => {
      const onSelect = vi.fn();
      render(
        <PromptChips
          chips={DEMO_PROMPT_CHIPS}
          variant="empty"
          disabled={false}
          onSelect={onSelect}
        />,
      );

      fireEvent.click(
        screen.getByRole("button", { name: /State management flow/ }),
      );

      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith(DEMO_PROMPT_CHIPS[2]);
    });

    it("renders native buttons that can take keyboard focus (covers: AC-11)", () => {
      render(
        <PromptChips
          chips={DEMO_PROMPT_CHIPS}
          variant="empty"
          disabled={false}
          onSelect={vi.fn()}
        />,
      );

      const buttons = screen.getAllByRole("button");
      for (const button of buttons) {
        expect(button.tagName).toBe("BUTTON");
        expect(button).toHaveAttribute("type", "button");
        expect(button).not.toHaveAttribute("tabindex", "-1");
        button.focus();
        expect(button).toHaveFocus();
      }
    });

    it("disables every chip and ignores clicks when disabled (covers: AC-10)", async () => {
      const onSelect = vi.fn();
      render(
        <PromptChips
          chips={DEMO_PROMPT_CHIPS}
          variant="empty"
          disabled={true}
          onSelect={onSelect}
        />,
      );

      const buttons = screen.getAllByRole("button");
      for (const button of buttons) {
        expect(button).toBeDisabled();
        expect(button).toHaveAttribute(
          "title",
          "Load a repository to ask questions",
        );
      }
      fireEvent.click(buttons[0]);

      expect(onSelect).not.toHaveBeenCalled();
    });

    it("renders no buttons for an empty chip list", () => {
      render(
        <PromptChips
          chips={[]}
          variant="empty"
          disabled={false}
          onSelect={vi.fn()}
        />,
      );

      expect(screen.queryAllByRole("button")).toHaveLength(0);
    });
  });

  describe("compact variant", () => {
    it("renders a labelled region holding one button per chip (covers: AC-11)", () => {
      render(
        <PromptChips
          chips={DEMO_PROMPT_CHIPS}
          variant="compact"
          disabled={false}
          onSelect={vi.fn()}
        />,
      );

      const region = screen.getByRole("region", { name: "Suggested prompts" });
      expect(region).toBeInTheDocument();
      expect(screen.getAllByRole("button")).toHaveLength(3);
      expect(
        screen.getByRole("button", { name: "State management flow" }),
      ).toBeInTheDocument();
    });

    it("does not repeat the chip descriptions as visible text (covers: AC-11)", () => {
      render(
        <PromptChips
          chips={DEMO_PROMPT_CHIPS}
          variant="compact"
          disabled={false}
          onSelect={vi.fn()}
        />,
      );

      expect(
        screen.queryByText(DEMO_PROMPT_CHIPS[0].description),
      ).not.toBeInTheDocument();
    });

    it("calls onSelect with the clicked chip (covers: AC-11)", async () => {
      const onSelect = vi.fn();
      render(
        <PromptChips
          chips={DEMO_PROMPT_CHIPS}
          variant="compact"
          disabled={false}
          onSelect={onSelect}
        />,
      );

      fireEvent.click(
        screen.getByRole("button", { name: "Architecture & layer breakdown" }),
      );

      expect(onSelect).toHaveBeenCalledWith(DEMO_PROMPT_CHIPS[0]);
    });

    it("does not submit a surrounding form when a chip is clicked", async () => {
      const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
      render(
        <form onSubmit={onSubmit}>
          <PromptChips
            chips={DEMO_PROMPT_CHIPS}
            variant="compact"
            disabled={false}
            onSelect={vi.fn()}
          />
        </form>,
      );

      fireEvent.click(
        screen.getByRole("button", { name: "State management flow" }),
      );

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("disables every chip and ignores clicks when disabled (covers: AC-10)", async () => {
      const onSelect = vi.fn();
      render(
        <PromptChips
          chips={DEMO_PROMPT_CHIPS}
          variant="compact"
          disabled={true}
          onSelect={onSelect}
        />,
      );

      const buttons = screen.getAllByRole("button");
      for (const button of buttons) {
        expect(button).toBeDisabled();
      }
      fireEvent.click(buttons[1]);

      expect(onSelect).not.toHaveBeenCalled();
    });
  });
});
