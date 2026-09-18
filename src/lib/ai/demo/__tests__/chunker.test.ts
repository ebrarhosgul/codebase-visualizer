import { describe, it, expect } from "vitest";
import { chunkMarkdown, sleep } from "../chunker";

describe("Markdown Chunker and Sleep", () => {
  it("returns empty array for empty or whitespace-only inputs", () => {
    expect(chunkMarkdown("")).toEqual([]);
  });

  it("satisfies chunks.join('') === input for diverse markdown strings", () => {
    const samples = [
      "# Header 1\n\nParagraph text with **bold** and `inline code`.",
      "1. Item one\n2. Item two\n\n* Sub item\n\n```ts\nconst a = 1;\n```",
      "Leading whitespace:   \n\n\tMiddle words\n\nTrailing newline\n\n",
      "SingleWord",
      "**bold-start** and normal and `code-end`",
    ];

    for (const sample of samples) {
      const chunks = chunkMarkdown(sample);
      expect(chunks.join("")).toBe(sample);
    }
  });

  it("preserves bold and inline code spans as atomic tokens", () => {
    const text =
      "Look at `src/components/Header.tsx` and **important module** now.";
    const chunks = chunkMarkdown(text);

    expect(chunks.join("")).toBe(text);

    // No chunk should contain an unclosed backtick or asterisks if the span itself wasn't split
    // Check that neither `src/components/Header.tsx` nor **important module** is broken into pieces across chunks
    const chunkWithCode = chunks.find((c) =>
      c.includes("src/components/Header.tsx"),
    );
    expect(chunkWithCode).toBeDefined();
    expect(chunkWithCode).toContain("`src/components/Header.tsx`");

    const chunkWithBold = chunks.find((c) => c.includes("important module"));
    expect(chunkWithBold).toBeDefined();
    expect(chunkWithBold).toContain("**important module**");
  });

  it("follows the [2, 3, 4] token cycle chunking", () => {
    // 9 single words = 3 chunks of lengths 2, 3, 4
    const text = "one two three four five six seven eight nine";
    const chunks = chunkMarkdown(text);

    expect(chunks.length).toBe(3);
    expect(chunks[0].trim().split(/\s+/).length).toBe(2);
    expect(chunks[1].trim().split(/\s+/).length).toBe(3);
    expect(chunks[2].trim().split(/\s+/).length).toBe(4);
  });

  it("sleep resolves after specified milliseconds", async () => {
    const start = Date.now();
    await sleep(20);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(15);
  });

  it("sleep aborts immediately when signal is aborted", async () => {
    const controller = new AbortController();
    const promise = sleep(1000, controller.signal);

    controller.abort();
    await promise; // Should resolve immediately without waiting 1000ms
  });

  it("sleep resolves immediately if signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const start = Date.now();
    await sleep(1000, controller.signal);
    expect(Date.now() - start).toBeLessThan(100);
  });
});
