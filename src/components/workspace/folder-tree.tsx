"use client";

import React, { useState, useMemo, useCallback, useEffect } from "react";
import {
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  FileCode,
  FileText,
  FileJson,
  Palette,
  FileImage,
  Settings,
  ChevronsDown,
  ChevronsUp,
  Filter,
} from "lucide-react";
import { type FileNode, isSourceFile } from "@/entities";
import { Tooltip } from "@/components/ui/tooltip";
import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/utils";

export interface TreeNode {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly isDirectory: boolean;
  readonly children: readonly TreeNode[];
  readonly file?: FileNode;
  readonly isCodeFile: boolean;
  readonly count: number;
}

export interface FolderTreeProps {
  readonly files: readonly FileNode[];
  readonly selectedFileId: string | null;
  readonly onSelectFile: (fileId: string) => void;
  readonly onHoverFile?: (fileId: string | null) => void;
  readonly searchQuery?: string;
  readonly showAllFiles: boolean;
  readonly onToggleShowAllFiles?: () => void;
  readonly className?: string;
}

export interface FileTypeStyle {
  readonly icon: React.ComponentType<{ className?: string }>;
  readonly iconColor: string;
  readonly badgeClass: string;
  readonly labelClass: string;
}

/**
 * Returns distinct icon, text color, and badge classes matching file extension/kind.
 */
export function getFileTypeStyle(
  fileName: string,
  ext: string,
  language: string,
): FileTypeStyle {
  const lowerExt = ext.toLowerCase();
  const lowerName = fileName.toLowerCase();

  // React TypeScript
  if (lowerExt === ".tsx") {
    return {
      icon: FileCode,
      iconColor: "text-cyan-400",
      badgeClass: "bg-cyan-950/60 text-cyan-300 border-cyan-800/60",
      labelClass: "text-cyan-100/90 group-hover:text-cyan-200",
    };
  }

  // Pure TypeScript
  if (lowerExt === ".ts" || language === "typescript") {
    return {
      icon: FileCode,
      iconColor: "text-sky-400",
      badgeClass: "bg-sky-950/60 text-sky-300 border-sky-800/60",
      labelClass: "text-sky-100/90 group-hover:text-sky-200",
    };
  }

  // React JavaScript
  if (lowerExt === ".jsx") {
    return {
      icon: FileCode,
      iconColor: "text-amber-300",
      badgeClass: "bg-amber-950/60 text-amber-300 border-amber-800/60",
      labelClass: "text-amber-100/90 group-hover:text-amber-200",
    };
  }

  // Pure JavaScript
  if (
    lowerExt === ".js" ||
    lowerExt === ".mjs" ||
    lowerExt === ".cjs" ||
    language === "javascript"
  ) {
    return {
      icon: FileCode,
      iconColor: "text-yellow-400",
      badgeClass: "bg-yellow-950/60 text-yellow-300 border-yellow-800/60",
      labelClass: "text-yellow-100/90 group-hover:text-yellow-200",
    };
  }

  // JSON Configuration & Data
  if (lowerExt === ".json") {
    return {
      icon: FileJson,
      iconColor: "text-emerald-400",
      badgeClass: "bg-emerald-950/60 text-emerald-300 border-emerald-800/60",
      labelClass: "text-emerald-100/80 group-hover:text-emerald-200",
    };
  }

  // Stylesheets
  if (
    lowerExt === ".css" ||
    lowerExt === ".scss" ||
    lowerExt === ".sass" ||
    lowerExt === ".less"
  ) {
    return {
      icon: Palette,
      iconColor: "text-pink-400",
      badgeClass: "bg-pink-950/60 text-pink-300 border-pink-800/60",
      labelClass: "text-pink-100/80 group-hover:text-pink-200",
    };
  }

  // Markdown & Documentation
  if (lowerExt === ".md" || lowerExt === ".mdx" || lowerExt === ".txt") {
    return {
      icon: FileText,
      iconColor: "text-purple-400",
      badgeClass: "bg-purple-950/60 text-purple-300 border-purple-800/60",
      labelClass: "text-purple-100/80 group-hover:text-purple-200",
    };
  }

  // Media & Images
  if (
    lowerExt === ".svg" ||
    lowerExt === ".png" ||
    lowerExt === ".jpg" ||
    lowerExt === ".jpeg" ||
    lowerExt === ".ico" ||
    lowerExt === ".webp"
  ) {
    return {
      icon: FileImage,
      iconColor: "text-rose-400",
      badgeClass: "bg-rose-950/60 text-rose-300 border-rose-800/60",
      labelClass: "text-rose-100/80 group-hover:text-rose-200",
    };
  }

  // Configuration & Dotfiles
  if (
    lowerName.startsWith(".env") ||
    lowerName.startsWith(".git") ||
    lowerName.includes("config") ||
    lowerName === "dockerfile"
  ) {
    return {
      icon: Settings,
      iconColor: "text-indigo-400",
      badgeClass: "bg-indigo-950/60 text-indigo-300 border-indigo-800/60",
      labelClass: "text-indigo-100/80 group-hover:text-indigo-200",
    };
  }

  // Fallback / Other
  return {
    icon: FileText,
    iconColor: "text-slate-400",
    badgeClass: "bg-slate-800/60 text-slate-300 border-slate-700/60",
    labelClass: "text-slate-300 group-hover:text-slate-100",
  };
}

/**
 * Builds a hierarchical tree of folders and files from flat FileNode array.
 */
function buildTree(
  files: readonly FileNode[],
  showAllFiles: boolean,
  searchQuery: string,
): {
  rootNodes: TreeNode[];
  allFolderIds: Set<string>;
  matchedFolderIds: Set<string>;
} {
  const query = searchQuery.trim().toLowerCase();
  const allFolderIds = new Set<string>();
  const matchedFolderIds = new Set<string>();

  // Filter files by code status if showAllFiles is false
  const eligibleFiles = files.filter((f) => {
    if (!showAllFiles && !isSourceFile(f.path)) {
      return false;
    }
    return true;
  });

  interface MutableNode {
    id: string;
    name: string;
    path: string;
    isDirectory: boolean;
    children: Map<string, MutableNode>;
    file?: FileNode;
    isCodeFile: boolean;
  }

  const rootChildren = new Map<string, MutableNode>();

  for (const file of eligibleFiles) {
    const isCode = isSourceFile(file.path);
    const segments = file.path.split("/");
    let currentMap = rootChildren;
    let accumulatedPath = "";

    // Walk folder segments
    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i] ?? "";
      accumulatedPath = accumulatedPath
        ? `${accumulatedPath}/${segment}`
        : segment;
      const folderId = `dir:${accumulatedPath}`;
      allFolderIds.add(folderId);

      if (!currentMap.has(segment)) {
        currentMap.set(segment, {
          id: folderId,
          name: segment,
          path: accumulatedPath,
          isDirectory: true,
          children: new Map<string, MutableNode>(),
          isCodeFile: false,
        });
      }

      currentMap = currentMap.get(segment)!.children;
    }

    // Leaf file
    const fileName = segments[segments.length - 1] ?? file.name;
    const filePath = file.path;
    const isMatched =
      !query ||
      fileName.toLowerCase().includes(query) ||
      filePath.toLowerCase().includes(query);

    if (isMatched && query) {
      // Mark ancestor folders as matched for auto-expansion
      let ancPath = "";
      for (let i = 0; i < segments.length - 1; i++) {
        const seg = segments[i] ?? "";
        ancPath = ancPath ? `${ancPath}/${seg}` : seg;
        matchedFolderIds.add(`dir:${ancPath}`);
      }
    }

    currentMap.set(fileName, {
      id: file.id,
      name: fileName,
      path: filePath,
      isDirectory: false,
      children: new Map(),
      file,
      isCodeFile: isCode,
    });
  }

  // Convert mutable tree to immutable TreeNode array with sorting (folders first, then files)
  function convert(nodeMap: Map<string, MutableNode>): TreeNode[] {
    const nodes: TreeNode[] = [];

    for (const raw of nodeMap.values()) {
      if (raw.isDirectory) {
        const childNodes = convert(raw.children);
        // If searching, hide empty folders that have no matches
        if (query && childNodes.length === 0) {
          continue;
        }
        nodes.push({
          id: raw.id,
          name: raw.name,
          path: raw.path,
          isDirectory: true,
          children: childNodes,
          isCodeFile: false,
          count: childNodes.length,
        });
      } else {
        const isMatched =
          !query ||
          raw.name.toLowerCase().includes(query) ||
          raw.path.toLowerCase().includes(query);

        if (isMatched) {
          nodes.push({
            id: raw.id,
            name: raw.name,
            path: raw.path,
            isDirectory: false,
            children: [],
            file: raw.file,
            isCodeFile: raw.isCodeFile,
            count: 1,
          });
        }
      }
    }

    // Sort: directories first alphabetically, then files alphabetically
    nodes.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    return nodes;
  }

  const rootNodes = convert(rootChildren);
  return { rootNodes, allFolderIds, matchedFolderIds };
}

/**
 * VS Code-style hierarchical folder tree component.
 */
export const FolderTree = React.memo(function FolderTree({
  files,
  selectedFileId,
  onSelectFile,
  onHoverFile,
  searchQuery = "",
  showAllFiles,
  onToggleShowAllFiles,
  className,
}: FolderTreeProps): React.JSX.Element {
  const { rootNodes, allFolderIds, matchedFolderIds } = useMemo(
    () => buildTree(files, showAllFiles, searchQuery),
    [files, showAllFiles, searchQuery],
  );

  // Expanded folders state (default to all folders expanded for quick browsing)
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(
    () => new Set(allFolderIds),
  );

  // Sync expanded folders when new folders are loaded
  useEffect(() => {
    setExpandedFolderIds((prev) => {
      const next = new Set(prev);
      for (const id of allFolderIds) {
        next.add(id);
      }
      return next;
    });
  }, [allFolderIds]);

  // If searching, auto-expand matched folders
  useEffect(() => {
    if (searchQuery.trim() && matchedFolderIds.size > 0) {
      setExpandedFolderIds((prev) => {
        const next = new Set(prev);
        for (const id of matchedFolderIds) {
          next.add(id);
        }
        return next;
      });
    }
  }, [searchQuery, matchedFolderIds]);

  const toggleFolder = useCallback((folderId: string) => {
    setExpandedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpandedFolderIds(new Set(allFolderIds));
  }, [allFolderIds]);

  const collapseAll = useCallback(() => {
    setExpandedFolderIds(new Set());
  }, []);

  const renderNode = (node: TreeNode, depth = 0): React.ReactNode => {
    const isExpanded = expandedFolderIds.has(node.id);
    const indentPx = depth * 14 + 6;

    if (node.isDirectory) {
      return (
        <div key={node.id} className="select-none">
          <div
            role="button"
            tabIndex={0}
            onClick={() => toggleFolder(node.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggleFolder(node.id);
              }
            }}
            className="flex items-center justify-between py-1 px-1.5 rounded text-xs hover:bg-[var(--surface-hover)] cursor-pointer group transition-colors"
            style={{ paddingLeft: `${indentPx}px` }}
            aria-expanded={isExpanded}
            aria-label={`Folder ${node.name}`}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-amber-400/70 group-hover:text-amber-300 shrink-0">
                {isExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
              </span>
              {isExpanded ? (
                <FolderOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              ) : (
                <Folder className="w-3.5 h-3.5 text-amber-500/90 shrink-0" />
              )}
              <span
                className="font-mono text-[11px] font-semibold text-amber-200/90 group-hover:text-amber-100 truncate"
                title={node.path}
              >
                {node.name}
              </span>
            </div>
            <span className="text-[9px] font-mono text-amber-400/80 bg-amber-950/40 border border-amber-800/30 px-1 py-0.2 rounded shrink-0">
              {node.children.length}
            </span>
          </div>

          {isExpanded && (
            <div className="space-y-0.5">
              {node.children.map((child) => renderNode(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    // File node
    const isSelected = node.id === selectedFileId;
    const ext = node.file?.extension || "";
    const lang = node.file?.language || "text";
    const style = getFileTypeStyle(node.name, ext, lang);
    const IconComponent = style.icon;

    if (!node.isCodeFile) {
      // Non-TS/JS file with minimal tooltip "Not allowed yet"
      return (
        <div key={node.id} style={{ paddingLeft: `${indentPx}px` }}>
          <Tooltip content="Not allowed yet" side="right">
            <div
              className="flex items-center justify-between py-1 px-1.5 rounded text-xs opacity-65 cursor-not-allowed hover:bg-[var(--surface-hover)] select-none transition-opacity group"
              tabIndex={-1}
              role="button"
              aria-disabled={true}
              aria-label={`${node.name} (Not allowed yet)`}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <IconComponent
                  className={cn(
                    "w-3.5 h-3.5 shrink-0 opacity-80",
                    style.iconColor,
                  )}
                />
                <span
                  className={cn(
                    "font-mono text-[11px] truncate",
                    style.labelClass,
                  )}
                  title={node.path}
                >
                  {node.name}
                </span>
              </div>
              <span
                className={cn(
                  "text-[9px] font-mono px-1 py-0.2 rounded border opacity-70 shrink-0",
                  style.badgeClass,
                )}
              >
                {ext || lang}
              </span>
            </div>
          </Tooltip>
        </div>
      );
    }

    // Code file (TS/JS)
    return (
      <div key={node.id} style={{ paddingLeft: `${indentPx}px` }}>
        <div
          role="button"
          tabIndex={0}
          onClick={() => onSelectFile(node.id)}
          onMouseEnter={() => onHoverFile?.(node.id)}
          onMouseLeave={() => onHoverFile?.(null)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSelectFile(node.id);
            }
          }}
          className={cn(
            "flex items-center justify-between py-1 px-1.5 rounded text-xs cursor-pointer select-none transition-colors group",
            isSelected
              ? "bg-[var(--surface-hover)] text-[var(--text-primary)] font-semibold border-l-2 border-[var(--accent-primary)]"
              : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]",
          )}
          aria-label={`File ${node.path}`}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <IconComponent
              className={cn("w-3.5 h-3.5 shrink-0", style.iconColor)}
            />
            <span
              className={cn(
                "font-mono text-[11px] truncate",
                isSelected
                  ? "text-[var(--text-primary)] font-semibold"
                  : style.labelClass,
              )}
              title={node.path}
            >
              {node.name}
            </span>
          </div>
          <span
            className={cn(
              "text-[9px] font-mono px-1.5 py-0.5 rounded border shrink-0",
              style.badgeClass,
            )}
          >
            {ext || lang}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className={cn("flex flex-col h-full min-h-0", className)}>
      {/* Folder Tree Action Toolbar */}
      <div className="flex items-center justify-between px-1 py-1 mb-1 border-b border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)]">
        <span className="text-[10px] font-semibold uppercase tracking-wider">
          Folders & Files
        </span>
        <div className="flex items-center gap-1">
          {onToggleShowAllFiles && (
            <Tooltip
              content={
                showAllFiles
                  ? "Showing all files (click to show TS/JS only)"
                  : "Showing TS/JS only (click to show all files)"
              }
              side="bottom"
            >
              <button
                type="button"
                onClick={onToggleShowAllFiles}
                className={cn(
                  "flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border transition-colors cursor-pointer",
                  showAllFiles
                    ? "bg-[var(--accent-primary)]/15 border-[var(--accent-primary)] text-[var(--accent-primary)]"
                    : "bg-[var(--surface-panel)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                )}
                aria-pressed={showAllFiles}
                aria-label="Toggle all files display"
              >
                <Filter className="w-2.5 h-2.5" />
                <span>{showAllFiles ? "All" : "Code"}</span>
              </button>
            </Tooltip>
          )}
          <IconButton
            icon={ChevronsDown}
            variant="ghost"
            size="sm"
            label="Expand all folders"
            onClick={expandAll}
            className="w-5 h-5 p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          />
          <IconButton
            icon={ChevronsUp}
            variant="ghost"
            size="sm"
            label="Collapse all folders"
            onClick={collapseAll}
            className="w-5 h-5 p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          />
        </div>
      </div>

      {/* Tree View Body */}
      <div className="flex-1 overflow-auto space-y-0.5 text-xs pr-1">
        {rootNodes.length > 0 ? (
          rootNodes.map((node) => renderNode(node, 0))
        ) : (
          <div className="p-4 text-center text-xs text-[var(--text-muted)] space-y-2">
            <Folder className="w-5 h-5 mx-auto opacity-50" />
            <p>
              {searchQuery
                ? "No files matching filter."
                : "No files available in repository."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
});
