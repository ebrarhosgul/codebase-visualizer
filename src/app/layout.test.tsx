import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const headerValues = vi.hoisted(() => new Map<string, string>());

vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (name: string) => headerValues.get(name) ?? null,
  }),
}));

vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "geist-sans-var" }),
  Geist_Mono: () => ({ variable: "geist-mono-var" }),
}));

import RootLayout, { metadata } from "./layout";

async function renderLayout(): Promise<string> {
  const element = await RootLayout({ children: <main>Workspace</main> });
  return renderToStaticMarkup(element);
}

describe("RootLayout", () => {
  beforeEach(() => {
    headerValues.clear();
  });

  it("stamps the middleware nonce onto the inline theme script", async () => {
    headerValues.set("x-nonce", "abc123nonce");

    const markup = await renderLayout();

    expect(markup).toMatch(/<script[^>]*nonce="abc123nonce"/);
  });

  it("renders the theme script without a nonce when middleware did not run", async () => {
    const markup = await renderLayout();

    expect(markup).toContain("<script");
    expect(markup).not.toContain("nonce=");
  });

  it("keeps the theme script that prevents a flash of the wrong theme", async () => {
    headerValues.set("x-nonce", "n");

    const markup = await renderLayout();

    expect(markup).toContain("codebase-visualizer-workspace");
  });

  it("renders the page content inside the body", async () => {
    const markup = await renderLayout();

    expect(markup).toMatch(/<body[^>]*>.*<main>Workspace<\/main>.*<\/body>/);
  });

  it("applies the font variables and the dark default on the html element", async () => {
    const markup = await renderLayout();

    expect(markup).toContain('lang="en"');
    expect(markup).toContain("geist-sans-var geist-mono-var dark");
  });

  it("exposes the page title and description", () => {
    expect(metadata.title).toBe("Codebase Visualizer");
    expect(metadata.description).toBeTruthy();
  });
});
