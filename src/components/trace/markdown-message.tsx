"use client";

import React, { useState, useCallback, useMemo } from "react";
import { Check, Copy, FileCode, Terminal } from "lucide-react";

/**
 * Supported markdown block elements produced by the parser.
 */
export type MarkdownBlock =
  | {
      readonly type: "heading";
      readonly level: 1 | 2 | 3 | 4 | 5 | 6;
      readonly text: string;
    }
  | {
      readonly type: "code_block";
      readonly language: string;
      readonly code: string;
    }
  | { readonly type: "math_block"; readonly expression: string }
  | { readonly type: "blockquote"; readonly text: string }
  | { readonly type: "unordered_list"; readonly items: readonly ListItemData[] }
  | { readonly type: "ordered_list"; readonly items: readonly ListItemData[] }
  | {
      readonly type: "table";
      readonly headers: readonly string[];
      readonly rows: readonly (readonly string[])[];
    }
  | { readonly type: "hr" }
  | { readonly type: "paragraph"; readonly text: string };

/**
 * Data structure for list items with optional nested child items.
 */
export interface ListItemData {
  readonly text: string;
  readonly subItems: readonly string[];
}

/**
 * Token representations for inline formatting.
 */
export type InlineToken =
  | { readonly type: "text"; readonly content: string }
  | { readonly type: "code"; readonly content: string }
  | {
      readonly type: "math";
      readonly content: string;
      readonly isBlock?: boolean;
    }
  | { readonly type: "bold"; readonly children: readonly InlineToken[] }
  | { readonly type: "italic"; readonly children: readonly InlineToken[] }
  | { readonly type: "bold_italic"; readonly children: readonly InlineToken[] }
  | {
      readonly type: "strikethrough";
      readonly children: readonly InlineToken[];
    }
  | { readonly type: "link"; readonly label: string; readonly href: string };

/**
 * Normalizes LaTeX math notation into clean, readable Unicode math text.
 */
export function formatLatexMath(latex: string): string {
  if (!latex) return "";

  let res = latex.trim();

  // Strip leading/trailing math delimiters if present
  if (res.startsWith("$$") && res.endsWith("$$") && res.length >= 4) {
    res = res.slice(2, -2).trim();
  } else if (res.startsWith("$") && res.endsWith("$") && res.length >= 2) {
    res = res.slice(1, -1).trim();
  }

  // Remove \text{...}, \mathrm{...}, \mathbf{...}, \mathit{...}
  res = res.replace(/\\(?:text|mathrm|mathbf|mathit)\{([^}]*)\}/g, "$1");

  // Unescape underscores: \_ -> _
  res = res.replace(/\\_/g, "_");

  // Clean subscript braces: _{text} -> _text
  res = res.replace(/_\{([^}]+)\}/g, "_$1");

  // Clean superscript braces: ^{text} -> ^$1
  res = res.replace(/\^\{([^}]+)\}/g, "^$1");

  // Convert standalone letter followed by curly brace like t{current} into t_current
  res = res.replace(/(?<![a-zA-Z\\])([a-zA-Z])\{([^}]+)\}/g, "$1_$2");

  // Handle \frac{num}{den} recursively
  while (/\\frac\{([^{}]+)\}\{([^{}]+)\}/.test(res)) {
    res = res.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "($1) / $2");
  }

  // Handle \sqrt{...}
  res = res.replace(/\\sqrt\{([^}]*)\}/g, "√($1)");

  // Common Greek letters
  const greekMap: Record<string, string> = {
    "\\Delta": "Δ",
    "\\delta": "δ",
    "\\theta": "θ",
    "\\Theta": "Θ",
    "\\alpha": "α",
    "\\beta": "β",
    "\\gamma": "γ",
    "\\Gamma": "Γ",
    "\\lambda": "λ",
    "\\Lambda": "Λ",
    "\\mu": "μ",
    "\\pi": "π",
    "\\Pi": "Π",
    "\\sigma": "σ",
    "\\Sigma": "Σ",
    "\\omega": "ω",
    "\\Omega": "Ω",
    "\\phi": "φ",
    "\\Phi": "Φ",
    "\\epsilon": "ε",
  };

  for (const [tex, unicode] of Object.entries(greekMap)) {
    res = res.replaceAll(tex, unicode);
  }

  // Common math symbols
  const symbolMap: Record<string, string> = {
    "\\times": "×",
    "\\cdot": "·",
    "\\pm": "±",
    "\\le": "≤",
    "\\leq": "≤",
    "\\ge": "≥",
    "\\geq": "≥",
    "\\ne": "≠",
    "\\neq": "≠",
    "\\approx": "≈",
    "\\infty": "∞",
    "\\sum": "∑",
    "\\int": "∫",
    "\\deg": "°",
    "\\to": "→",
    "\\rightarrow": "→",
  };

  for (const [tex, unicode] of Object.entries(symbolMap)) {
    res = res.replaceAll(tex, unicode);
  }

  // Common trigonometric/math function names (\sin, \cos, \tan, etc.)
  res = res.replace(/\\(sin|cos|tan|ln|log|exp|min|max|lim)\b/g, "$1");

  // Remove spacing commands: \,, \;, \!, \quad, \qquad
  res = res.replace(/\\(?:quad|qquad|[;,!])/g, " ");

  // Remove \left and \right
  res = res.replace(/\\(?:left|right)/g, "");

  // Clean remaining stray backslashes before known ascii words
  res = res.replace(/\\([a-zA-Z]+)/g, "$1");

  // Collapse space between delta prefix and variable (e.g. \Delta t -> Δt, \Delta lat -> Δlat)
  res = res.replace(/([Δδ])\s+([a-zA-Z])/g, "$1$2");

  // Collapse consecutive spaces
  res = res.replace(/\s+/g, " ").trim();

  return res;
}

/**
 * Parses inline formatting tags like bold, italic, inline code, math, and links.
 */
export function parseInlineTokens(rawText: string): readonly InlineToken[] {
  if (!rawText) return [];

  const inlineRegex =
    /(`[^`]+`|\$\$[^\$]+?\$\$|\$(?!\s)[^\$\n]+?(?<!\s)\$|\*\*\*[\s\S]+?\*\*\*|\*\*[\s\S]+?\*\*|__[\s\S]+?__|\*[\s\S]+?\*|(?<!\w)_[^_]+_(?!\w)|~~[\s\S]+?~~|\[[^\]]+\]\([^)]+\))/g;

  const parts = rawText.split(inlineRegex);
  const result: InlineToken[] = [];

  for (const part of parts) {
    if (!part) continue;

    if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
      result.push({ type: "code", content: part.slice(1, -1) });
    } else if (
      part.startsWith("$$") &&
      part.endsWith("$$") &&
      part.length >= 4
    ) {
      result.push({
        type: "math",
        content: formatLatexMath(part.slice(2, -2)),
        isBlock: true,
      });
    } else if (
      part.startsWith("$") &&
      part.endsWith("$") &&
      part.length >= 2 &&
      !part.startsWith("$$")
    ) {
      result.push({
        type: "math",
        content: formatLatexMath(part.slice(1, -1)),
        isBlock: false,
      });
    } else if (
      part.startsWith("***") &&
      part.endsWith("***") &&
      part.length >= 6
    ) {
      result.push({
        type: "bold_italic",
        children: parseInlineTokens(part.slice(3, -3)),
      });
    } else if (
      (part.startsWith("**") && part.endsWith("**") && part.length >= 4) ||
      (part.startsWith("__") && part.endsWith("__") && part.length >= 4)
    ) {
      result.push({
        type: "bold",
        children: parseInlineTokens(part.slice(2, -2)),
      });
    } else if (
      (part.startsWith("*") && part.endsWith("*") && part.length >= 2) ||
      (part.startsWith("_") && part.endsWith("_") && part.length >= 2)
    ) {
      result.push({
        type: "italic",
        children: parseInlineTokens(part.slice(1, -1)),
      });
    } else if (
      part.startsWith("~~") &&
      part.endsWith("~~") &&
      part.length >= 4
    ) {
      result.push({
        type: "strikethrough",
        children: parseInlineTokens(part.slice(2, -2)),
      });
    } else {
      const linkMatch = part.match(/^\[(.*)\]\((.*)\)$/);
      if (linkMatch) {
        result.push({
          type: "link",
          label: linkMatch[1],
          href: linkMatch[2],
        });
      } else {
        result.push({ type: "text", content: part });
      }
    }
  }

  return Object.freeze(result);
}

const SAFE_LINK_PROTOCOLS: readonly string[] = ["http:", "https:", "mailto:"];

/**
 * Returns a normalized href only for http, https, and mailto links.
 * Model output is untrusted, so any other scheme (javascript:, data:,
 * vbscript:, or a relative path) is refused instead of relying on the
 * framework to neutralize it.
 */
export function getSafeLinkHref(href: string): string | null {
  try {
    const url = new URL(href.trim());
    return SAFE_LINK_PROTOCOLS.includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * Checks if a line resembles a table boundary row.
 */
function isTableRow(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.includes("|")
  );
}

/**
 * Splits a markdown table row into individual column cells.
 */
function parseTableRow(line: string): readonly string[] {
  return Object.freeze(
    line
      .trim()
      .slice(1, -1)
      .split("|")
      .map((cell) => cell.trim()),
  );
}

/**
 * Verifies if a line is a markdown table separator row.
 */
function isTableSeparator(line: string): boolean {
  const cells = parseTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell));
}

/**
 * Parses raw markdown text into a sequence of structured blocks.
 */
export function parseMarkdown(rawContent: string): readonly MarkdownBlock[] {
  if (!rawContent) return [];

  const blocks: MarkdownBlock[] = [];
  const lines = rawContent.split(/\r?\n/);
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    // Code block with optional language identifier
    if (line.trim().startsWith("```")) {
      const langMatch = line.trim().match(/^```([a-zA-Z0-9_-]*)/);
      const language = langMatch ? langMatch[1] : "";
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length && lines[i].trim().startsWith("```")) {
        i++;
      }
      blocks.push({
        type: "code_block",
        language: language || "text",
        code: codeLines.join("\n"),
      });
      continue;
    }

    // Display Math block ($$...$$)
    if (line.trim().startsWith("$$")) {
      const trimmed = line.trim();
      if (
        trimmed.startsWith("$$") &&
        trimmed.endsWith("$$") &&
        trimmed.length >= 4
      ) {
        blocks.push({
          type: "math_block",
          expression: formatLatexMath(trimmed.slice(2, -2)),
        });
        i++;
        continue;
      }
      const mathLines: string[] = [trimmed.slice(2)];
      i++;
      while (i < lines.length && !lines[i].trim().endsWith("$$")) {
        mathLines.push(lines[i]);
        i++;
      }
      if (i < lines.length && lines[i].trim().endsWith("$$")) {
        const last = lines[i].trim();
        mathLines.push(last.slice(0, -2));
        i++;
      }
      blocks.push({
        type: "math_block",
        expression: formatLatexMath(mathLines.join(" ")),
      });
      continue;
    }

    // Heading tags
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = Math.min(6, Math.max(1, headingMatch[1].length)) as
        1 | 2 | 3 | 4 | 5 | 6;
      blocks.push({
        type: "heading",
        level,
        text: headingMatch[2].trim(),
      });
      i++;
      continue;
    }

    // Table
    if (
      isTableRow(line) &&
      i + 1 < lines.length &&
      isTableSeparator(lines[i + 1])
    ) {
      const headers = parseTableRow(line);
      i += 2;
      const rows: (readonly string[])[] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(parseTableRow(lines[i]));
        i++;
      }
      blocks.push({
        type: "table",
        headers,
        rows: Object.freeze(rows),
      });
      continue;
    }

    // Blockquote
    if (line.startsWith("> ") || line === ">") {
      const quoteLines: string[] = [];
      while (
        i < lines.length &&
        (lines[i].startsWith("> ") || lines[i] === ">")
      ) {
        quoteLines.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({
        type: "blockquote",
        text: quoteLines.join("\n"),
      });
      continue;
    }

    // Horizontal rule
    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    // Ordered or unordered list item
    const isOrdered = /^\s*(\d+)\.\s+(.*)$/.test(line);
    const isUnordered = /^\s*[-*+]\s+(.*)$/.test(line);

    if (isOrdered || isUnordered) {
      const listType = isOrdered ? "ordered_list" : "unordered_list";
      const items: ListItemData[] = [];

      while (i < lines.length) {
        const currLine = lines[i];
        const ord = currLine.match(/^(\s*)(\d+)\.\s+(.*)$/);
        const unord = currLine.match(/^(\s*)[-*+]\s+(.*)$/);

        if (ord || unord) {
          const indent = (ord ? ord[1] : unord![1]).length;
          const content = ord ? ord[3] : unord![2];

          // Sub item under previous list element
          if (
            (indent >= 2 || (unord && listType === "ordered_list")) &&
            items.length > 0
          ) {
            const lastItem = items[items.length - 1];
            items[items.length - 1] = {
              text: lastItem.text,
              subItems: Object.freeze([...lastItem.subItems, content]),
            };
          } else if (ord && listType === "ordered_list") {
            items.push({ text: content, subItems: Object.freeze([]) });
          } else if (unord && listType === "unordered_list") {
            items.push({ text: content, subItems: Object.freeze([]) });
          } else {
            break;
          }
          i++;
        } else if (
          currLine.trim() &&
          (currLine.startsWith("    ") ||
            currLine.startsWith("\t") ||
            currLine.startsWith("  "))
        ) {
          if (items.length > 0) {
            const lastItem = items[items.length - 1];
            items[items.length - 1] = {
              text: lastItem.text,
              subItems: Object.freeze([...lastItem.subItems, currLine.trim()]),
            };
          }
          i++;
        } else if (!currLine.trim()) {
          if (
            i + 1 < lines.length &&
            (/^\s*(\d+)\.\s+/.test(lines[i + 1]) ||
              /^\s*[-*+]\s+/.test(lines[i + 1]))
          ) {
            i++;
          } else {
            break;
          }
        } else {
          break;
        }
      }

      blocks.push({
        type: listType,
        items: Object.freeze(items),
      });
      continue;
    }

    // Paragraph
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith("```") &&
      !lines[i].trim().startsWith("$$") &&
      !lines[i].match(/^#{1,6}\s+/) &&
      !lines[i].startsWith("> ") &&
      !/^(?:-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim()) &&
      !/^\s*(\d+)\.\s+/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !(
        isTableRow(lines[i]) &&
        i + 1 < lines.length &&
        isTableSeparator(lines[i + 1])
      )
    ) {
      paraLines.push(lines[i]);
      i++;
    }

    if (paraLines.length > 0) {
      blocks.push({
        type: "paragraph",
        text: paraLines.join(" "),
      });
    }
  }

  return Object.freeze(blocks);
}

/**
 * Properties accepted by the MarkdownMessage component.
 */
export interface MarkdownMessageProps {
  readonly content: string;
  readonly isStreaming?: boolean;
  readonly onFileClick?: (path: string) => void;
  readonly knownFilePaths?: readonly string[];
  readonly className?: string;
}

/**
 * Checks if an inline code snippet matches a recognized repository file path or file name.
 */
function findMatchingFilePath(
  code: string,
  knownPaths?: readonly string[],
): string | null {
  if (!knownPaths || knownPaths.length === 0) return null;
  const clean = code.trim().replace(/^['"`]|['"`]$/g, "");
  if (!clean || clean.length < 2) return null;

  for (const p of knownPaths) {
    if (p === clean || p.endsWith(`/${clean}`)) {
      return p;
    }
  }
  return null;
}

/**
 * Renders inline tokens recursively into accessible React elements.
 */
function InlineContent({
  tokens,
  onFileClick,
  knownFilePaths,
}: {
  readonly tokens: readonly InlineToken[];
  readonly onFileClick?: (path: string) => void;
  readonly knownFilePaths?: readonly string[];
}): React.JSX.Element {
  return (
    <>
      {tokens.map((token, index) => {
        switch (token.type) {
          case "text":
            return <React.Fragment key={index}>{token.content}</React.Fragment>;

          case "code": {
            const matchedFile = findMatchingFilePath(
              token.content,
              knownFilePaths,
            );
            if (matchedFile && onFileClick) {
              return (
                <button
                  type="button"
                  key={index}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onFileClick(matchedFile);
                  }}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[11px] font-mono bg-[var(--surface-panel-secondary)] border border-[var(--border-subtle)] text-[var(--accent-primary)] hover:border-[var(--accent-primary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer align-baseline"
                  title={`Open ${matchedFile} in code viewer`}
                >
                  <FileCode className="w-2.5 h-2.5 text-[var(--accent-primary)] shrink-0" />
                  <span>{token.content}</span>
                </button>
              );
            }
            return (
              <code
                key={index}
                className="px-1.5 py-0.5 rounded-sm text-[11px] font-mono bg-[var(--surface-panel-secondary)] border border-[var(--border-subtle)] text-[var(--accent-primary)] align-baseline"
              >
                {token.content}
              </code>
            );
          }

          case "math":
            if (token.isBlock) {
              return (
                <span
                  key={index}
                  className="block my-2 px-3 py-1.5 rounded-sm bg-[var(--surface-panel-secondary)] border border-[var(--border-subtle)] font-mono text-[11.5px] text-[var(--accent-primary)] text-center tracking-wide overflow-x-auto select-all"
                >
                  {token.content}
                </span>
              );
            }
            return (
              <span
                key={index}
                className="inline-block px-1.5 py-0.5 mx-0.5 rounded-sm bg-[var(--surface-panel-secondary)] font-mono text-[11px] text-[var(--accent-primary)] align-baseline"
              >
                {token.content}
              </span>
            );

          case "bold":
            return (
              <strong
                key={index}
                className="font-semibold text-[var(--text-primary)]"
              >
                <InlineContent
                  tokens={token.children}
                  onFileClick={onFileClick}
                  knownFilePaths={knownFilePaths}
                />
              </strong>
            );

          case "italic":
            return (
              <em key={index} className="italic text-[var(--text-secondary)]">
                <InlineContent
                  tokens={token.children}
                  onFileClick={onFileClick}
                  knownFilePaths={knownFilePaths}
                />
              </em>
            );

          case "bold_italic":
            return (
              <strong
                key={index}
                className="font-semibold text-[var(--text-primary)]"
              >
                <em className="italic">
                  <InlineContent
                    tokens={token.children}
                    onFileClick={onFileClick}
                    knownFilePaths={knownFilePaths}
                  />
                </em>
              </strong>
            );

          case "strikethrough":
            return (
              <del
                key={index}
                className="line-through text-[var(--text-muted)]"
              >
                <InlineContent
                  tokens={token.children}
                  onFileClick={onFileClick}
                  knownFilePaths={knownFilePaths}
                />
              </del>
            );

          case "link": {
            const safeHref = getSafeLinkHref(token.href);
            if (!safeHref) {
              return <span key={index}>{token.label}</span>;
            }
            return (
              <a
                key={index}
                href={safeHref}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--accent-primary)] hover:underline inline-flex items-center gap-0.5"
              >
                {token.label}
              </a>
            );
          }

          default:
            return null;
        }
      })}
    </>
  );
}

/**
 * Fenced code block with one click copy action and language label.
 */
function CodeBlock({
  language,
  code,
}: {
  readonly language: string;
  readonly code: string;
}): React.JSX.Element {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard write failures in restricted environments
    }
  }, [code]);

  return (
    <div className="my-2.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-panel)] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--surface-panel-secondary)] border-b border-[var(--border-subtle)] text-[10px] text-[var(--text-secondary)]">
        <div className="flex items-center gap-1.5 font-mono uppercase tracking-wider">
          <Terminal className="w-3 h-3 text-[var(--accent-primary)]" />
          <span>{language || "code"}</span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
          title="Copy code snippet"
          aria-label={copied ? "Code copied" : "Copy code"}
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-[var(--status-success)]" />
              <span className="text-[var(--status-success)]">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-[11px] font-mono leading-relaxed text-[var(--text-primary)] bg-[var(--surface-canvas)]">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/**
 * Renders structured markdown content for AI responses with code highlighting and navigation.
 */
function MarkdownMessageComponent({
  content,
  isStreaming = false,
  onFileClick,
  knownFilePaths,
  className = "",
}: MarkdownMessageProps): React.JSX.Element {
  const blocks = useMemo(() => parseMarkdown(content), [content]);

  if (!content.trim() && isStreaming) {
    return (
      <div
        className={`flex items-center gap-2 text-[var(--text-muted)] py-1 ${className}`}
      >
        <span className="inline-block w-2 h-2 rounded-full bg-[var(--accent-primary)] animate-ping" />
        <span className="text-xs">Analyzing architecture...</span>
      </div>
    );
  }

  return (
    <div className={`space-y-2 text-xs leading-relaxed ${className}`}>
      {blocks.map((block, index) => {
        switch (block.type) {
          case "heading": {
            const inlineTokens = parseInlineTokens(block.text);
            if (block.level === 1) {
              return (
                <h1
                  key={index}
                  className="text-sm font-bold text-[var(--text-primary)] mt-3 mb-1.5 pb-1 border-b border-[var(--border-subtle)]"
                >
                  <InlineContent
                    tokens={inlineTokens}
                    onFileClick={onFileClick}
                    knownFilePaths={knownFilePaths}
                  />
                </h1>
              );
            }
            if (block.level === 2) {
              return (
                <h2
                  key={index}
                  className="text-xs font-semibold text-[var(--text-primary)] mt-3 mb-1"
                >
                  <InlineContent
                    tokens={inlineTokens}
                    onFileClick={onFileClick}
                    knownFilePaths={knownFilePaths}
                  />
                </h2>
              );
            }
            return (
              <h3
                key={index}
                className="text-[11px] font-semibold text-[var(--accent-primary)] uppercase tracking-wider mt-2.5 mb-1"
              >
                <InlineContent
                  tokens={inlineTokens}
                  onFileClick={onFileClick}
                  knownFilePaths={knownFilePaths}
                />
              </h3>
            );
          }

          case "paragraph": {
            const inlineTokens = parseInlineTokens(block.text);
            return (
              <p
                key={index}
                className="my-1.5 leading-relaxed text-[var(--text-primary)]"
              >
                <InlineContent
                  tokens={inlineTokens}
                  onFileClick={onFileClick}
                  knownFilePaths={knownFilePaths}
                />
              </p>
            );
          }

          case "code_block":
            return (
              <CodeBlock
                key={index}
                language={block.language}
                code={block.code}
              />
            );

          case "math_block":
            return (
              <div
                key={index}
                className="my-2 px-3 py-2 rounded-sm bg-[var(--surface-panel-secondary)] border border-[var(--border-subtle)] font-mono text-xs text-[var(--accent-primary)] text-center tracking-wide overflow-x-auto select-all"
              >
                {block.expression}
              </div>
            );

          case "blockquote": {
            const inlineTokens = parseInlineTokens(block.text);
            return (
              <blockquote
                key={index}
                className="border-l-2 border-[var(--accent-primary)] pl-2.5 py-0.5 my-2 bg-[var(--surface-panel-secondary)]/40 rounded-r text-[var(--text-secondary)] italic text-[11.5px]"
              >
                <InlineContent
                  tokens={inlineTokens}
                  onFileClick={onFileClick}
                  knownFilePaths={knownFilePaths}
                />
              </blockquote>
            );
          }

          case "ordered_list":
            return (
              <ol key={index} className="space-y-2.5 my-2 list-none pl-0">
                {block.items.map((item, itemIdx) => {
                  const inlineTokens = parseInlineTokens(item.text);
                  return (
                    <li key={itemIdx} className="flex flex-col space-y-1">
                      <div className="flex items-start gap-2">
                        <span className="flex items-center justify-center w-4 h-4 rounded-full bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] text-[10px] font-semibold shrink-0 mt-0.5">
                          {itemIdx + 1}
                        </span>
                        <div className="flex-1 leading-relaxed text-[var(--text-primary)]">
                          <InlineContent
                            tokens={inlineTokens}
                            onFileClick={onFileClick}
                            knownFilePaths={knownFilePaths}
                          />
                        </div>
                      </div>
                      {item.subItems.length > 0 && (
                        <ul className="pl-6 space-y-1 my-1 list-none">
                          {item.subItems.map((sub, sIdx) => {
                            const subTokens = parseInlineTokens(sub);
                            return (
                              <li
                                key={sIdx}
                                className="flex items-start gap-2 text-[11.5px] text-[var(--text-secondary)]"
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] shrink-0 mt-1.5 opacity-75" />
                                <div className="flex-1 leading-relaxed">
                                  <InlineContent
                                    tokens={subTokens}
                                    onFileClick={onFileClick}
                                    knownFilePaths={knownFilePaths}
                                  />
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ol>
            );

          case "unordered_list":
            return (
              <ul key={index} className="space-y-1.5 my-2 list-none pl-0">
                {block.items.map((item, itemIdx) => {
                  const inlineTokens = parseInlineTokens(item.text);
                  return (
                    <li key={itemIdx} className="flex flex-col space-y-1">
                      <div className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] shrink-0 mt-1.5" />
                        <div className="flex-1 leading-relaxed text-[var(--text-primary)]">
                          <InlineContent
                            tokens={inlineTokens}
                            onFileClick={onFileClick}
                            knownFilePaths={knownFilePaths}
                          />
                        </div>
                      </div>
                      {item.subItems.length > 0 && (
                        <ul className="pl-5 space-y-1 my-1 list-none">
                          {item.subItems.map((sub, sIdx) => {
                            const subTokens = parseInlineTokens(sub);
                            return (
                              <li
                                key={sIdx}
                                className="flex items-start gap-2 text-[11.5px] text-[var(--text-secondary)]"
                              >
                                <span className="w-1 h-1 rounded-full bg-[var(--text-muted)] shrink-0 mt-1.5" />
                                <div className="flex-1 leading-relaxed">
                                  <InlineContent
                                    tokens={subTokens}
                                    onFileClick={onFileClick}
                                    knownFilePaths={knownFilePaths}
                                  />
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            );

          case "table":
            return (
              <div
                key={index}
                className="overflow-x-auto my-2 rounded-sm border border-[var(--border-subtle)] bg-[var(--surface-panel)]"
              >
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-[var(--surface-panel-secondary)] border-b border-[var(--border-subtle)] text-[var(--text-secondary)]">
                      {block.headers.map((h, hIdx) => (
                        <th key={hIdx} className="p-2 font-semibold">
                          <InlineContent
                            tokens={parseInlineTokens(h)}
                            onFileClick={onFileClick}
                            knownFilePaths={knownFilePaths}
                          />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, rIdx) => (
                      <tr
                        key={rIdx}
                        className="border-b border-[var(--border-subtle)] last:border-b-0 hover:bg-[var(--surface-hover)] transition-colors"
                      >
                        {row.map((cell, cIdx) => (
                          <td
                            key={cIdx}
                            className="p-2 text-[var(--text-primary)]"
                          >
                            <InlineContent
                              tokens={parseInlineTokens(cell)}
                              onFileClick={onFileClick}
                              knownFilePaths={knownFilePaths}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );

          case "hr":
            return (
              <hr key={index} className="my-3 border-[var(--border-subtle)]" />
            );

          default:
            return null;
        }
      })}

      {isStreaming && (
        <span className="inline-block w-1.5 h-3.5 ml-1 bg-[var(--accent-primary)] animate-pulse align-middle" />
      )}
    </div>
  );
}

export const MarkdownMessage = React.memo(MarkdownMessageComponent);
MarkdownMessage.displayName = "MarkdownMessage";
