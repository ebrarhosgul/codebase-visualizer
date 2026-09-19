import { describe, it, expect } from "vitest";
import { createDemoCitation, deduplicateCitations } from "../citations";
import { DEMO_MAX_CITATIONS } from "../limits";

describe("createDemoCitation", () => {
  it("points at line 1 of the file with the path as label and no snippet (covers: AC-2, AC-3, AC-4)", () => {
    const citation = createDemoCitation("file:src/a.ts", "src/a.ts");

    expect(citation).toEqual({
      id: "cite:file:src/a.ts_1",
      fileId: "file:src/a.ts",
      line: 1,
      column: null,
      label: "src/a.ts",
      snippet: null,
    });
  });
});

describe("deduplicateCitations", () => {
  const cite = (n: number) => createDemoCitation(`file:${n}`, `src/${n}.ts`);

  it("keeps only the first citation when a file is cited twice (covers: AC-2, AC-3, AC-4)", () => {
    const result = deduplicateCitations([cite(1), cite(2), cite(1)]);

    expect(result.map((c) => c.fileId)).toEqual(["file:1", "file:2"]);
  });

  it("preserves insertion order of the first appearances", () => {
    const result = deduplicateCitations([cite(3), cite(1), cite(2), cite(3)]);

    expect(result.map((c) => c.fileId)).toEqual(["file:3", "file:1", "file:2"]);
  });

  it("caps the result at the default limit of 8 citations", () => {
    const many = Array.from({ length: 12 }, (_, i) => cite(i));

    const result = deduplicateCitations(many);

    expect(DEMO_MAX_CITATIONS).toBe(8);
    expect(result).toHaveLength(8);
    expect(result[7].fileId).toBe("file:7");
  });

  it("counts only distinct files toward the cap", () => {
    const withRepeats = [
      ...Array.from({ length: 5 }, () => cite(0)),
      ...Array.from({ length: 8 }, (_, i) => cite(i + 1)),
    ];

    const result = deduplicateCitations(withRepeats);

    expect(result).toHaveLength(8);
    expect(new Set(result.map((c) => c.fileId)).size).toBe(8);
  });

  it("honors a custom limit", () => {
    const result = deduplicateCitations([cite(1), cite(2), cite(3)], 2);

    expect(result.map((c) => c.fileId)).toEqual(["file:1", "file:2"]);
  });

  it("returns an empty list for empty input", () => {
    expect(deduplicateCitations([])).toEqual([]);
  });

  it("returns a frozen list so callers cannot mutate it", () => {
    const result = deduplicateCitations([cite(1)]);

    expect(Object.isFrozen(result)).toBe(true);
  });
});
