import { describe, it, expect } from "vitest";
import { resolveDemoIntent } from "../router";
import { DEMO_PROMPT_CHIPS } from "../chips";

describe("Demo Intent Router", () => {
  it("prioritizes explicit intent hints over keyword parsing", () => {
    expect(resolveDemoIntent("Where is state stored?", "layer_breakdown")).toBe(
      "layer_breakdown",
    );
    expect(resolveDemoIntent("Explain architecture", "state_flow")).toBe(
      "state_flow",
    );
  });

  it("routes state-related keywords to state_flow", () => {
    expect(resolveDemoIntent("How is global state handled?")).toBe(
      "state_flow",
    );
    expect(resolveDemoIntent("Show me the stores in this repo")).toBe(
      "state_flow",
    );
    expect(resolveDemoIntent("Is zustand used here?")).toBe("state_flow");
    expect(resolveDemoIntent("Where is redux or context provider?")).toBe(
      "state_flow",
    );
    expect(resolveDemoIntent("What is the state flow?")).toBe("state_flow");
  });

  it("distinguishes word boundary for state from substrings like statement", () => {
    // "statement" should not trigger state_flow
    expect(resolveDemoIntent("Explain this switch statement")).toBe("overview");
  });

  it("routes bottleneck and hub keywords to central_files", () => {
    expect(resolveDemoIntent("Which files are the bottlenecks?")).toBe(
      "central_files",
    );
    expect(resolveDemoIntent("Show the central components")).toBe(
      "central_files",
    );
    expect(resolveDemoIntent("What are the most imported files?")).toBe(
      "central_files",
    );
    expect(resolveDemoIntent("Which core module has high fan-in?")).toBe(
      "central_files",
    );
    expect(resolveDemoIntent("What is the communication hub?")).toBe(
      "central_files",
    );
  });

  it("routes architectural structure keywords to layer_breakdown", () => {
    expect(resolveDemoIntent("Explain the architecture layers")).toBe(
      "layer_breakdown",
    );
    expect(resolveDemoIntent("What is the folder structure?")).toBe(
      "layer_breakdown",
    );
    expect(resolveDemoIntent("How is the code organised?")).toBe(
      "layer_breakdown",
    );
    expect(resolveDemoIntent("Give me a breakdown of modules")).toBe(
      "layer_breakdown",
    );
  });

  it("routes trace, flow, and dependency keywords to path_trace", () => {
    expect(resolveDemoIntent("Trace the dependency between file A and B")).toBe(
      "path_trace",
    );
    expect(resolveDemoIntent("How does file A connect to file B?")).toBe(
      "path_trace",
    );
    expect(resolveDemoIntent("Follow the execution path")).toBe("path_trace");
    expect(resolveDemoIntent("Inspect the data flow")).toBe("path_trace");
  });

  it("falls back to overview for general queries", () => {
    expect(resolveDemoIntent("What does this project do?")).toBe("overview");
    expect(resolveDemoIntent("Summarize the codebase")).toBe("overview");
    expect(resolveDemoIntent("Hello")).toBe("overview");
  });

  it("correctly routes all prompt texts in DEMO_PROMPT_CHIPS", () => {
    for (const chip of DEMO_PROMPT_CHIPS) {
      const resolved = resolveDemoIntent(chip.promptText);
      expect(resolved).toBe(chip.intent);
    }
  });
});
