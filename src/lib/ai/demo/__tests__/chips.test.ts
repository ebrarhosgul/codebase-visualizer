import { describe, it, expect } from "vitest";
import { DEMO_PROMPT_CHIPS } from "../chips";

describe("DEMO_PROMPT_CHIPS", () => {
  it("ships exactly the three chips named in the spec, in order (covers: AC-1)", () => {
    expect(DEMO_PROMPT_CHIPS.map((c) => c.label)).toEqual([
      "Architecture & layer breakdown",
      "Core bottleneck / central files",
      "State management flow",
    ]);
  });

  it("maps each chip to its own intent (covers: AC-1)", () => {
    expect(DEMO_PROMPT_CHIPS.map((c) => [c.id, c.intent] as const)).toEqual([
      ["layer-breakdown", "layer_breakdown"],
      ["central-files", "central_files"],
      ["state-flow", "state_flow"],
    ]);
  });

  it("gives every chip a non empty description and prompt text (covers: AC-11)", () => {
    for (const chip of DEMO_PROMPT_CHIPS) {
      expect(chip.description.trim().length).toBeGreaterThan(0);
      expect(chip.promptText.trim().length).toBeGreaterThan(0);
    }
  });

  it("uses unique ids so aria-describedby targets never collide (covers: AC-11)", () => {
    const ids = DEMO_PROMPT_CHIPS.map((c) => c.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("is frozen so the catalog cannot be mutated at runtime", () => {
    expect(Object.isFrozen(DEMO_PROMPT_CHIPS)).toBe(true);
    for (const chip of DEMO_PROMPT_CHIPS) {
      expect(Object.isFrozen(chip)).toBe(true);
    }
  });
});
