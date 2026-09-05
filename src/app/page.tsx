"use client";

import React, { useState, useMemo, useCallback, Suspense } from "react";
import {
  Search,
  Layers,
  Code2,
  Sparkles,
  GitBranch,
  Package,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";
import { WorkspaceLayout } from "@/components/layout";
import { Input, Badge, Tabs, Toast } from "@/components/ui";
import { ArchitectureCanvas } from "@/components/canvas";
import { CodeViewer } from "@/components/editor";
import { RepoSubmissionBar } from "@/components/workspace/repo-submission-bar";
import { FolderTree } from "@/components/workspace";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useGraphStore } from "@/stores/graph-store";
import { DeepLinkingSync } from "@/hooks/use-deep-linking";

export default function Home(): React.JSX.Element {
  const [fileFilter, setFileFilter] = useState("");
  const [showAllFiles, setShowAllFiles] = useState(false);
  const activeRightTab = useWorkspaceStore((state) => state.activeRightTab);
  const setActiveRightTab = useWorkspaceStore(
    (state) => state.setActiveRightTab,
  );

  const graph = useGraphStore((state) => state.graph);
  const repository = graph?.repository ?? null;
  const selectedNodeId = useGraphStore((state) => state.selectedNodeId);
  const selectedFileId = useGraphStore((state) => state.selectedFileId);
  const selectNode = useGraphStore((state) => state.selectNode);
  const setHoveredNodeId = useGraphStore((state) => state.setHoveredNodeId);
  const navigateToTarget = useGraphStore((state) => state.navigateToTarget);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const handleDeepLinkFallback = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  const allFiles = useMemo(
    () => (graph?.files ? Object.values(graph.files) : []),
    [graph],
  );

  const handleSelectFile = useCallback(
    (fileId: string) => {
      selectNode(fileId);
      setActiveRightTab("code");
      useWorkspaceStore.getState().setRightPanelCollapsed(false);
      if (useWorkspaceStore.getState().isSmallScreen) {
        useWorkspaceStore.getState().setRightDrawerOpen(true);
      }
      navigateToTarget({
        fileId,
        source: "canvas",
        timestamp: Date.now(),
      });
    },
    [selectNode, setActiveRightTab, navigateToTarget],
  );

  // Selected node inspection data
  const selectedNodeDetails = useMemo(() => {
    if (!graph || !selectedNodeId) {
      return null;
    }

    if (selectedNodeId.startsWith("file:")) {
      const file = graph.files[selectedNodeId];
      if (!file) return null;

      // Find incoming and outgoing edges for this file
      const incoming = Object.values(graph.edges).filter(
        (e) => e.targetId === file.id,
      );
      const outgoing = Object.values(graph.edges).filter(
        (e) => e.sourceId === file.id,
      );

      return {
        type: "file" as const,
        file,
        incoming,
        outgoing,
      };
    }

    if (selectedNodeId.startsWith("ext:")) {
      const ext = graph.externalModules[selectedNodeId];
      if (!ext) return null;

      const incoming = Object.values(graph.edges).filter(
        (e) => e.targetId === ext.id,
      );

      return {
        type: "external" as const,
        ext,
        incoming,
      };
    }

    return null;
  }, [graph, selectedNodeId]);

  const leftContent = (
    <div className="p-3 flex flex-col gap-3 h-full">
      {/* Active Repository Metadata Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <GitBranch className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
          <span
            className="text-xs font-semibold text-[var(--text-primary)] truncate"
            title={repository?.fullName ?? "No repository loaded"}
          >
            {repository ? repository.fullName : "No repository"}
          </span>
        </div>
        {repository ? (
          <Badge variant="accent" className="shrink-0 font-mono text-[10px]">
            {repository.defaultBranch}
          </Badge>
        ) : (
          <Badge variant="default" className="shrink-0 text-[10px]">
            idle
          </Badge>
        )}
      </div>

      {/* Language Breakdown Badges if repository loaded */}
      {repository && Object.keys(repository.languages).length > 0 && (
        <div className="flex flex-wrap gap-1">
          {Object.entries(repository.languages).map(([lang, count]) => (
            <Badge
              key={lang}
              variant={lang === "typescript" ? "syntax-ts" : "syntax-js"}
              className="text-[10px]"
            >
              {lang}: {count}
            </Badge>
          ))}
          <Badge variant="default" className="text-[10px]">
            {repository.totalFiles} files
          </Badge>
        </div>
      )}

      {/* File Search Input */}
      <Input
        icon={Search}
        value={fileFilter}
        onChange={(e) => setFileFilter(e.target.value)}
        placeholder="Filter files..."
        aria-label="Filter repository files"
        className="h-8 text-xs"
      />

      {/* File Navigation Tree (VS Code-style hierarchical folder tree) */}
      <FolderTree
        files={allFiles}
        selectedFileId={selectedFileId}
        onSelectFile={handleSelectFile}
        onHoverFile={setHoveredNodeId}
        searchQuery={fileFilter}
        showAllFiles={showAllFiles}
        onToggleShowAllFiles={() => setShowAllFiles((prev) => !prev)}
        className="flex-1 min-h-0"
      />
    </div>
  );

  const centerContent = <ArchitectureCanvas />;

  const rightContent = (
    <div className="w-full h-full flex-1 min-h-0 flex flex-col">
      <Tabs
        value={activeRightTab}
        onValueChange={(val) =>
          setActiveRightTab(val as "code" | "inspector" | "trace")
        }
        className="w-full h-full flex-1 min-h-0"
        items={[
          {
            value: "code",
            label: (
              <span className="flex items-center gap-1.5">
                <Code2 className="w-3.5 h-3.5" />
                <span>Code</span>
              </span>
            ),
            content: <CodeViewer />,
          },
          {
            value: "inspector",
            label: (
              <span className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" />
                <span>Inspector</span>
              </span>
            ),
            content: (
              <div className="p-4 text-xs text-[var(--text-secondary)] space-y-4 overflow-auto h-full">
                {selectedNodeDetails ? (
                  selectedNodeDetails.type === "file" ? (
                    <div className="space-y-4">
                      <div>
                        <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                          File Details
                        </div>
                        <div className="text-sm font-semibold text-[var(--text-primary)] font-mono mt-1 break-all">
                          {selectedNodeDetails.file.path}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 p-2.5 rounded bg-[var(--surface-canvas)] border border-[var(--border-subtle)] font-mono text-[11px]">
                        <div>
                          <span className="text-[var(--text-muted)]">
                            Lines:{" "}
                          </span>
                          <span className="text-[var(--text-primary)]">
                            {selectedNodeDetails.file.lineCount}
                          </span>
                        </div>
                        <div>
                          <span className="text-[var(--text-muted)]">
                            Size:{" "}
                          </span>
                          <span className="text-[var(--text-primary)]">
                            {Math.round(
                              (selectedNodeDetails.file.sizeBytes / 1024) * 10,
                            ) / 10}{" "}
                            KB
                          </span>
                        </div>
                      </div>

                      {/* Outgoing Imports */}
                      <div>
                        <div className="text-[11px] font-semibold text-[var(--text-primary)] flex items-center gap-1.5 mb-2">
                          <ArrowRight className="w-3 h-3 text-[var(--accent-primary)]" />
                          <span>
                            Imports ({selectedNodeDetails.outgoing.length})
                          </span>
                        </div>
                        {selectedNodeDetails.outgoing.length > 0 ? (
                          <div className="space-y-1">
                            {selectedNodeDetails.outgoing.map((edge) => (
                              <div
                                key={edge.id}
                                onClick={() => selectNode(edge.targetId)}
                                className="p-1.5 rounded bg-[var(--surface-canvas)] border border-[var(--border-subtle)] flex items-center justify-between cursor-pointer hover:border-[var(--accent-primary)]"
                              >
                                <span
                                  className="font-mono text-[10px] truncate"
                                  title={edge.targetId}
                                >
                                  {edge.targetId.replace(/^(file:|ext:)/, "")}
                                </span>
                                <Badge
                                  variant={
                                    edge.isExternal ? "warning" : "syntax-ts"
                                  }
                                >
                                  {edge.isExternal ? "ext" : "local"}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px] text-[var(--text-muted)]">
                            No outgoing imports.
                          </p>
                        )}
                      </div>

                      {/* Incoming Dependents */}
                      <div>
                        <div className="text-[11px] font-semibold text-[var(--text-primary)] flex items-center gap-1.5 mb-2">
                          <ArrowLeft className="w-3 h-3 text-[var(--accent-primary)]" />
                          <span>
                            Imported by ({selectedNodeDetails.incoming.length})
                          </span>
                        </div>
                        {selectedNodeDetails.incoming.length > 0 ? (
                          <div className="space-y-1">
                            {selectedNodeDetails.incoming.map((edge) => (
                              <div
                                key={edge.id}
                                onClick={() => selectNode(edge.sourceId)}
                                className="p-1.5 rounded bg-[var(--surface-canvas)] border border-[var(--border-subtle)] flex items-center justify-between cursor-pointer hover:border-[var(--accent-primary)]"
                              >
                                <span
                                  className="font-mono text-[10px] truncate"
                                  title={edge.sourceId}
                                >
                                  {edge.sourceId.replace(/^file:/, "")}
                                </span>
                                <Badge variant="syntax-ts">importer</Badge>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px] text-[var(--text-muted)]">
                            Not imported by any parsed file.
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-amber-400" />
                        <span className="text-xs font-semibold text-[var(--text-primary)]">
                          External Package
                        </span>
                      </div>
                      <div className="font-mono text-sm text-amber-300">
                        {selectedNodeDetails.ext.name}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)]">
                        Referenced by {selectedNodeDetails.incoming.length}{" "}
                        files in this codebase.
                      </div>
                    </div>
                  )
                ) : (
                  <div className="space-y-2 text-center py-8 text-[var(--text-muted)]">
                    <Layers className="w-6 h-6 mx-auto opacity-50" />
                    <div className="text-xs font-semibold text-[var(--text-primary)]">
                      No Node Selected
                    </div>
                    <p className="text-[11px] max-w-xs mx-auto">
                      Click any file or external module on the graph canvas to
                      inspect declarations, incoming imports, and dependencies.
                    </p>
                  </div>
                )}
              </div>
            ),
          },
          {
            value: "trace",
            label: (
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Trace</span>
              </span>
            ),
            content: (
              <div className="p-4 text-xs text-[var(--text-secondary)] space-y-3">
                <div className="text-xs font-semibold text-[var(--text-primary)]">
                  Path Query
                </div>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Semantic path tracer will be available in Slice 4.
                </p>
              </div>
            ),
          },
        ]}
      />
    </div>
  );

  return (
    <>
      <h1 className="sr-only">Codebase Visualizer</h1>
      <Suspense fallback={null}>
        <DeepLinkingSync onFallback={handleDeepLinkFallback} />
      </Suspense>
      <WorkspaceLayout
        headerContent={<RepoSubmissionBar />}
        leftContent={leftContent}
        centerContent={centerContent}
        rightContent={rightContent}
      />
      {toastMessage && (
        <Toast
          message={toastMessage}
          variant="warning"
          onClose={() => setToastMessage(null)}
        />
      )}
    </>
  );
}
