import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";

describe("Home Page", () => {
  it("renders heading and badges", () => {
    render(<Home />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Codebase Visualizer" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Next.js 15")).toBeInTheDocument();
    expect(screen.getByText("TypeScript 5")).toBeInTheDocument();
    expect(screen.getByText("Tailwind CSS v4")).toBeInTheDocument();
  });
});
