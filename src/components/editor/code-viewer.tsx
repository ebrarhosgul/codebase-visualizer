"use client";

import React from "react";
import Editor from "@monaco-editor/react";
import { FileCode, AlertTriangle, Code2 } from "lucide-react";
import { Badge } from "@/components/ui";
import { useGraphStore } from "@/stores/graph-store";

/**
 * Maps a file extension or path to Monaco Editor language identifier.
 */
function getMonacoLanguage(filePath: string): string {
  if (filePath.endsWith(".tsx") || filePath.endsWith(".ts")) {
    return "typescript";
  }
  if (
    filePath.endsWith(".jsx") ||
    filePath.endsWith(".js") ||
    filePath.endsWith(".mjs")
  ) {
    return "javascript";
  }
  if (filePath.endsWith(".json")) {
    return "json";
  }
  if (filePath.endsWith(".css")) {
    return "css";
  }
  if (filePath.endsWith(".html")) {
    return "html";
  }
  if (filePath.endsWith(".md")) {
    return "markdown";
  }
  return "plaintext";
}

/**
 * Formats byte counts into human readable strings.
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kb = bytes / 1024;
  return `${kb.toFixed(1)} KB`;
}

export interface CodeViewerProps {
  readonly className?: string;
}

/**
 * Side by side Monaco Editor component displaying source code
 * for the currently selected file node from in memory store.
 */
export function CodeViewer({ className }: CodeViewerProps): React.JSX.Element {
  const selectedFileId = useGraphStore((state) => state.selectedFileId);
  const fileSources = useGraphStore((state) => state.fileSources);
  const graph = useGraphStore((state) => state.graph);

  const fileNode = selectedFileId && graph ? graph.files[selectedFileId] : null;
  const sourceCode = selectedFileId ? fileSources[selectedFileId] : null;

  if (
    !selectedFileId ||
    !fileNode ||
    sourceCode === null ||
    sourceCode === undefined
  ) {
    return (
      <div
        className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-[var(--text-muted)] bg-[var(--surface-panel)] select-none"
        data-testid="code-viewer-empty"
      >
        <div className="w-10 h-10 rounded-lg bg-[var(--surface-canvas)] border border-[var(--border-subtle)] flex items-center justify-center mb-3 text-[var(--text-secondary)]">
          <Code2 className="w-5 h-5" />
        </div>
        <div className="text-xs font-semibold text-[var(--text-primary)] mb-1">
          No File Selected
        </div>
        <p className="text-[11px] max-w-xs text-[var(--text-secondary)] leading-relaxed">
          Click any file node on the architecture map canvas to inspect its
          source code side by side.
        </p>
      </div>
    );
  }

  const language = getMonacoLanguage(fileNode.path);

  return (
    <div
      className={`w-full h-full flex flex-col bg-[var(--surface-panel)] ${className ?? ""}`}
      data-testid="code-viewer"
    >
      {/* File Header Bar */}
      <div className="px-3 py-2 border-b border-[var(--border-subtle)] bg-[var(--surface-panel-secondary)] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 overflow-hidden min-w-0">
          <FileCode className="w-3.5 h-3.5 text-[var(--syntax-ts)] shrink-0" />
          <span
            className="text-xs font-mono font-medium text-[var(--text-primary)] truncate"
            title={fileNode.path}
          >
            {fileNode.path}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Badge variant="syntax-ts">{fileNode.extension || language}</Badge>
          <span className="text-[10px] text-[var(--text-muted)] font-mono">
            {fileNode.lineCount} lines
          </span>
          <span className="text-[10px] text-[var(--text-muted)] font-mono">
            ({formatBytes(fileNode.sizeBytes)})
          </span>
        </div>
      </div>

      {/* Syntax error warning banner if any */}
      {fileNode.parseError && (
        <div className="px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/20 text-amber-400 flex items-center gap-2 text-[11px]">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">
            Syntax Warning: {fileNode.parseError}
          </span>
        </div>
      )}

      {/* Monaco Editor Canvas */}
      <div className="flex-1 w-full min-h-0 relative">
        <Editor
          height="100%"
          language={language}
          value={sourceCode}
          theme="vs-dark"
          options={{
            readOnly: true,
            fontSize: 12,
            lineNumbers: "on",
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            renderWhitespace: "selection",
            domReadOnly: true,
            cursorBlinking: "solid",
            padding: { top: 8, bottom: 8 },
            fontFamily: "var(--font-mono, monospace)",
          }}
        />
      </div>
    </div>
  );
}
