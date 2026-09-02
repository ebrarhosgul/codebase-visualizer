import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";

describe("Home Page", () => {
  it("renders page header, repository input, canvas, and inspector tabs", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Codebase Visualizer" }),
    ).toBeInTheDocument();

    expect(
      screen.getByLabelText("Public GitHub Repository URL"),
    ).toBeInTheDocument();

    expect(
      screen.getByLabelText("Filter repository files"),
    ).toBeInTheDocument();

    expect(screen.getByRole("tab", { name: /Code/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Inspector/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Trace/i })).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: "Analyze Repository" }),
    ).toBeInTheDocument();
  });
});
