"use client";

import React, { useRef, useEffect, useCallback, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { FileCode, AlertTriangle, Code2, Share2, Check } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { useGraphStore, type NavigationTarget } from "@/stores/graph-store";
import type { SymbolNode } from "@/entities";

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
 * for the currently selected file node from in memory store,
 * supporting bidirectional programmatic line reveal and cursor tracking.
 */
type MonacoEditorInstance = Parameters<OnMount>[0];
type MonacoNamespace = Parameters<OnMount>[1];
type MonacoDecorationsCollection = ReturnType<
  MonacoEditorInstance["createDecorationsCollection"]
>;

export function CodeViewer({ className }: CodeViewerProps): React.JSX.Element {
  const selectedFileId = useGraphStore((state) => state.selectedFileId);
  const fileSources = useGraphStore((state) => state.fileSources);
  const graph = useGraphStore((state) => state.graph);
  const activeTarget = useGraphStore((state) => state.activeTarget);
  const navigateToTarget = useGraphStore((state) => state.navigateToTarget);

  const [copied, setCopied] = useState(false);

  // References to Monaco editor and decoration instances
  const editorRef = useRef<MonacoEditorInstance | null>(null);
  const monacoRef = useRef<MonacoNamespace | null>(null);
  const decorationsCollectionRef = useRef<MonacoDecorationsCollection | null>(
    null,
  );
  const pulseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const cursorDebounceRef = useRef<NodeJS.Timeout | null>(null);

  const fileNode = selectedFileId && graph ? graph.files[selectedFileId] : null;
  const sourceCode = selectedFileId ? fileSources[selectedFileId] : null;

  // Programmatic reveal and pulse decoration when activeTarget updates (AC-2)
  const revealAndHighlightLine = useCallback((target: NavigationTarget) => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco || target.line == null) {
      return;
    }

    const targetLine = target.line;
    const targetCol = target.column ?? 1;

    editor.revealLineInCenter(targetLine, monaco.editor.ScrollType.Smooth);
    editor.setPosition({ lineNumber: targetLine, column: targetCol });

    // Clean up previous pulse decorations
    if (decorationsCollectionRef.current) {
      decorationsCollectionRef.current.clear();
    }
    if (pulseTimeoutRef.current) {
      clearTimeout(pulseTimeoutRef.current);
    }

    // Create new pulse decoration on the target line
    const range = new monaco.Range(targetLine, 1, targetLine, 1);
    const collection = editor.createDecorationsCollection([
      {
        range,
        options: {
          isWholeLine: true,
          className: "monaco-pulse-line",
          overviewRuler: {
            color: "#38bdf8",
            position: monaco.editor.OverviewRulerLane.Full,
          },
        },
      },
    ]);
    decorationsCollectionRef.current = collection;

    // 2-second fade out timer
    pulseTimeoutRef.current = setTimeout(() => {
      if (decorationsCollectionRef.current) {
        decorationsCollectionRef.current.clear();
      }
    }, 2000);
  }, []);

  // Subscribe to activeTarget changes to trigger reveal
  useEffect(() => {
    if (
      activeTarget &&
      activeTarget.fileId === selectedFileId &&
      activeTarget.line != null
    ) {
      revealAndHighlightLine(activeTarget);
    }
  }, [activeTarget, selectedFileId, revealAndHighlightLine]);

  // Handle editor mount: capture instances and wire cursor listener (AC-3)
  const handleEditorMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;

      // If there's an active target pending for this file, reveal immediately
      const currentTarget = useGraphStore.getState().activeTarget;
      if (
        currentTarget &&
        currentTarget.fileId === selectedFileId &&
        currentTarget.line != null
      ) {
        revealAndHighlightLine(currentTarget);
      }

      // Register cursor position change listener with 150ms debounce
      const disposable = editor.onDidChangeCursorPosition((e) => {
        if (cursorDebounceRef.current) {
          clearTimeout(cursorDebounceRef.current);
        }

        cursorDebounceRef.current = setTimeout(() => {
          const cursorLine = e.position.lineNumber;
          const currentFileId = useGraphStore.getState().selectedFileId;
          const currentGraph = useGraphStore.getState().graph;
          if (!currentFileId || !currentGraph) {
            return;
          }

          const currentFile = currentGraph.files[currentFileId];
          if (!currentFile) {
            return;
          }

          // Check if reverse navigation is locked (dual-guard AC-4)
          if (
            useGraphStore
              .getState()
              .isNavigationLocked(currentFileId, cursorLine)
          ) {
            return;
          }

          // Identify innermost symbol where startLine <= cursorLine <= endLine
          let innermostSymbol: SymbolNode | null = null;
          let smallestSpan = Infinity;

          for (const sId of currentFile.symbolIds) {
            const sym = currentGraph.symbols[sId];
            if (!sym) {
              continue;
            }
            if (
              sym.range.startLine <= cursorLine &&
              cursorLine <= sym.range.endLine
            ) {
              const span = sym.range.endLine - sym.range.startLine;
              if (span < smallestSpan) {
                smallestSpan = span;
                innermostSymbol = sym;
              }
            }
          }

          navigateToTarget({
            fileId: currentFileId,
            symbolId: innermostSymbol ? innermostSymbol.id : null,
            line: cursorLine,
            column: e.position.column,
            source: "editor",
            timestamp: Date.now(),
          });
        }, 150);
      });

      return () => {
        disposable.dispose();
      };
    },
    [selectedFileId, revealAndHighlightLine, navigateToTarget],
  );

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (pulseTimeoutRef.current) {
        clearTimeout(pulseTimeoutRef.current);
      }
      if (cursorDebounceRef.current) {
        clearTimeout(cursorDebounceRef.current);
      }
    };
  }, []);

  // Copy deep link permalink to clipboard (AC-8)
  const handleSharePermalink = useCallback(async () => {
    if (!fileNode) {
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set("file", fileNode.path);
    if (activeTarget?.line) {
      url.searchParams.set("line", String(activeTarget.line));
    }
    if (activeTarget?.symbolId && graph?.symbols[activeTarget.symbolId]) {
      url.searchParams.set("symbol", graph.symbols[activeTarget.symbolId].name);
    }

    try {
      await navigator.clipboard.writeText(url.toString());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard write issues
    }
  }, [fileNode, activeTarget, graph]);

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
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSharePermalink}
            className="h-6 px-2 text-[11px] flex items-center gap-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            title="Copy deep link permalink for this file and line"
            aria-label="Copy deep link permalink"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                <span className="text-emerald-400 text-[10px]">Copied!</span>
              </>
            ) : (
              <>
                <Share2 className="w-3 h-3" />
                <span className="text-[10px] hidden sm:inline">Share</span>
              </>
            )}
          </Button>
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
          onMount={handleEditorMount}
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
