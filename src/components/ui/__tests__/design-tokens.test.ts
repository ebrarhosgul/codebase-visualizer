import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

const CSS = readFileSync(
  path.resolve(import.meta.dirname, "../../../app/globals.css"),
  "utf8",
);

type TokenMap = Readonly<Record<string, string>>;

function readBlock(selector: string): TokenMap {
  const start = CSS.indexOf(`${selector} {`);
  const end = CSS.indexOf("\n}", start);
  const body = CSS.slice(start, end);
  return Object.fromEntries(
    [...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [
      m[1],
      m[2].trim(),
    ]),
  );
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  );
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const THEMES: readonly (readonly [string, TokenMap])[] = [
  ["dark", readBlock(":root")],
  ["light", readBlock(".light")],
];

const SURFACES = [
  "--surface-canvas",
  "--surface-panel",
  "--surface-panel-secondary",
  "--surface-card",
] as const;

describe.each(THEMES)("design tokens (%s theme, AC-1)", (_name, tokens) => {
  it.each(SURFACES)(
    "keeps text, accent text, and status hues at 4.5:1 on %s",
    (surface) => {
      for (const fg of [
        "--text-primary",
        "--text-secondary",
        "--text-muted",
        "--accent-text",
        "--status-success",
        "--status-warning",
        "--status-error",
        "--status-info",
      ]) {
        expect(
          contrast(tokens[fg], tokens[surface]),
          `${fg} on ${surface}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it.each(SURFACES)("keeps the focus ring at 3:1 on %s", (surface) => {
    expect(
      contrast(tokens["--border-focus"], tokens[surface]),
    ).toBeGreaterThanOrEqual(3);
  });

  it("keeps filled button labels readable", () => {
    for (const fill of ["--accent-primary", "--accent-primary-hover"]) {
      expect(
        contrast(tokens["--accent-primary-foreground"], tokens[fill]),
        fill,
      ).toBeGreaterThanOrEqual(4.5);
    }
    expect(
      contrast("#ffffff", tokens["--status-error-solid"]),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("defines borders as opaque hex rules so panel edges stay crisp", () => {
    for (const token of [
      "--border-subtle",
      "--border-default",
      "--border-strong",
    ]) {
      expect(tokens[token], token).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe("global pointer cursor", () => {
  it("restores the pointer for buttons that preflight resets", () => {
    expect(CSS).toMatch(/button:not\(:disabled\)[\s\S]*?cursor:\s*pointer/);
  });

  it("keeps the not allowed cursor for disabled controls", () => {
    expect(CSS).toMatch(/button:disabled[\s\S]*?cursor:\s*not-allowed/);
  });
});
