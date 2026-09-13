import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  MarkdownMessage,
  parseMarkdown,
  parseInlineTokens,
} from "../markdown-message";

describe("MarkdownMessage", () => {
  it("renders plain paragraph text", () => {
    render(
      <MarkdownMessage content="This is an architectural summary of the application." />,
    );

    expect(
      screen.getByText("This is an architectural summary of the application."),
    ).toBeInTheDocument();
  });

  it("renders headings at appropriate levels", () => {
    const markdown = `# Main Title\n## Section Subtitle\n### Connection & Data Flow`;
    render(<MarkdownMessage content={markdown} />);

    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent("Main Title");

    const h2 = screen.getByRole("heading", { level: 2 });
    expect(h2).toHaveTextContent("Section Subtitle");

    const h3 = screen.getByRole("heading", { level: 3 });
    expect(h3).toHaveTextContent("Connection & Data Flow");
  });

  it("renders ordered lists with numbers, bold labels, and sub items", () => {
    const markdown = `1. **State Provider Hook (\`hooks/useTelemetry.ts\`)**:
- Manages real-time telemetry state updates (coordinates, altitude, speed, timestamp).
- Simulates or streams real-time updates for flight tracking data.

2. **Dashboard Coordinator Component (\`components/flight/FlightDashboard.tsx\`)**:
- Calls \`useTelemetry(initialData)\` to hold and update the active telemetry state.`;

    render(<MarkdownMessage content={markdown} />);

    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText(/State Provider Hook/)).toBeInTheDocument();
    expect(screen.getByText("hooks/useTelemetry.ts")).toBeInTheDocument();
    expect(
      screen.getByText(/Manages real-time telemetry state updates/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("components/flight/FlightDashboard.tsx"),
    ).toBeInTheDocument();
  });

  it("renders unordered lists with bullet points", () => {
    const markdown = `- Total files: 42\n- Total edges: 88\n- Total directories: 12`;
    render(<MarkdownMessage content={markdown} />);

    expect(screen.getByText(/Total files: 42/)).toBeInTheDocument();
    expect(screen.getByText(/Total edges: 88/)).toBeInTheDocument();
    expect(screen.getByText(/Total directories: 12/)).toBeInTheDocument();
  });

  it("renders fenced code block with language badge and copy action", async () => {
    const markdown =
      "```typescript\nconst message = 'hello visualizer';\nconsole.log(message);\n```";
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(<MarkdownMessage content={markdown} />);

    expect(screen.getByText("typescript")).toBeInTheDocument();
    expect(
      screen.getByText(/const message = 'hello visualizer';/),
    ).toBeInTheDocument();

    const copyBtn = screen.getByRole("button", { name: /copy code/i });
    expect(copyBtn).toBeInTheDocument();

    await React.act(async () => {
      fireEvent.click(copyBtn);
    });
    expect(writeTextMock).toHaveBeenCalledWith(
      "const message = 'hello visualizer';\nconsole.log(message);",
    );
  });

  it("renders inline code and triggers onFileClick when matching known files", () => {
    const markdown =
      "Check out `hooks/useTelemetry.ts` and `unknownHelper()` for details.";
    const onFileClick = vi.fn();
    const knownFilePaths = [
      "hooks/useTelemetry.ts",
      "components/flight/FlightDashboard.tsx",
    ];

    render(
      <MarkdownMessage
        content={markdown}
        onFileClick={onFileClick}
        knownFilePaths={knownFilePaths}
      />,
    );

    const fileButton = screen.getByRole("button", {
      name: /hooks\/useTelemetry\.ts/i,
    });
    expect(fileButton).toBeInTheDocument();

    fireEvent.click(fileButton);
    expect(onFileClick).toHaveBeenCalledWith("hooks/useTelemetry.ts");

    // unknownHelper is not a known file, so it remains a code badge, not a button
    expect(screen.getByText("unknownHelper()")).toBeInTheDocument();
  });

  it("renders blockquote element", () => {
    const markdown =
      "> Note: Modules maintain unidirectionally bound relationships.";
    render(<MarkdownMessage content={markdown} />);

    expect(
      screen.getByText(
        "Note: Modules maintain unidirectionally bound relationships.",
      ),
    ).toBeInTheDocument();
  });

  it("renders tables with headers and rows", () => {
    const markdown = `| Module | Layer | Status |
|---|---|---|
| FlightMap.tsx | UI | Verified |
| useTelemetry.ts | Hook | Verified |`;

    render(<MarkdownMessage content={markdown} />);

    expect(screen.getByText("Module")).toBeInTheDocument();
    expect(screen.getByText("Layer")).toBeInTheDocument();
    expect(screen.getByText("FlightMap.tsx")).toBeInTheDocument();
    expect(screen.getByText("useTelemetry.ts")).toBeInTheDocument();
  });

  it("renders loading indicator when streaming without content", () => {
    render(<MarkdownMessage content="" isStreaming={true} />);

    expect(screen.getByText("Analyzing architecture...")).toBeInTheDocument();
  });

  it("renders streaming pulse cursor alongside partial content", () => {
    const { container } = render(
      <MarkdownMessage content="Analyzing repository..." isStreaming={true} />,
    );

    expect(screen.getByText("Analyzing repository...")).toBeInTheDocument();
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("parses bold, italic, bold italic, and strikethrough", () => {
    const tokens = parseInlineTokens(
      "**bold** and *italic* and ***bold-italic*** and ~~deleted~~",
    );

    expect(tokens[0].type).toBe("bold");
    expect(tokens[2].type).toBe("italic");
    expect(tokens[4].type).toBe("bold_italic");
    expect(tokens[6].type).toBe("strikethrough");
  });

  it("parses unclosed code blocks during streaming gracefully", () => {
    const partialStream =
      "```tsx\nexport function Component() {\n  return <div>Loading</div>;";
    const blocks = parseMarkdown(partialStream);

    expect(blocks.length).toBe(1);
    expect(blocks[0].type).toBe("code_block");
    if (blocks[0].type === "code_block") {
      expect(blocks[0].language).toBe("tsx");
      expect(blocks[0].code).toContain("export function Component()");
    }
  });

  it("renders external links with secure target and rel attributes", () => {
    const markdown =
      "Read the [documentation](https://example.com/docs) for details.";
    render(<MarkdownMessage content={markdown} />);

    const link = screen.getByRole("link", { name: "documentation" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "https://example.com/docs");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders horizontal line dividers", () => {
    const markdown = "Top section\n\n---\n\nBottom section";
    const { container } = render(<MarkdownMessage content={markdown} />);

    expect(screen.getByText("Top section")).toBeInTheDocument();
    expect(screen.getByText("Bottom section")).toBeInTheDocument();
    expect(container.querySelector("hr")).toBeInTheDocument();
  });

  it("renders multi line blockquotes preserving content", () => {
    const markdown =
      "> Architectural consideration line 1\n> Second guideline statement";
    render(<MarkdownMessage content={markdown} />);

    expect(
      screen.getByText(/Architectural consideration line 1/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Second guideline statement/)).toBeInTheDocument();
  });

  it("handles copy code clipboard errors without throwing", async () => {
    const markdown = "```javascript\nconst x = 42;\n```";
    const writeTextMock = vi
      .fn()
      .mockRejectedValue(new Error("Clipboard denied"));
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(<MarkdownMessage content={markdown} />);

    const copyBtn = screen.getByRole("button", { name: /copy code/i });
    await React.act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(writeTextMock).toHaveBeenCalledWith("const x = 42;");
    expect(screen.getByText(/const x = 42;/)).toBeInTheDocument();
  });

  it("returns empty output when content is empty and not streaming", () => {
    const { container } = render(
      <MarkdownMessage content="" isStreaming={false} />,
    );
    expect(container.firstChild?.textContent).toBe("");
  });

  it("parses unclosed inline tokens safely without errors", () => {
    const tokens = parseInlineTokens(
      "Testing unclosed formatting **bold without end",
    );
    expect(tokens.length).toBeGreaterThan(0);
  });
});
