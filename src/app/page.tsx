"use client";

import React, { useState, useMemo, useCallback, Suspense } from "react";
import { Search, Layers, Code2, Sparkles, GitBranch } from "lucide-react";
import { WorkspaceLayout } from "@/components/layout";
import { Input, Badge, Tabs, Toast } from "@/components/ui";
import { ArchitectureCanvas } from "@/components/canvas";
import { CodeViewer } from "@/components/editor";
import { RepoSubmissionBar } from "@/components/workspace/repo-submission-bar";
import { FolderTree, NodeInspector } from "@/components/workspace";
import { TracePanel } from "@/components/trace/trace-panel";
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
  const selectedFileId = useGraphStore((state) => state.selectedFileId);
  const selectNode = useGraphStore((state) => state.selectNode);
  const setHoveredNodeId = useGraphStore((state) => state.setHoveredNodeId);

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
    },
    [selectNode, setActiveRightTab],
  );

  const leftContent = (
    <div className="p-4 flex flex-col gap-4 h-full bg-[var(--surface-panel)]">
      {/* Active Repository Metadata Bar */}
      <div className="flex items-center justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-panel-secondary)] px-2.5 py-2">
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
        <div className="flex flex-wrap gap-1.5">
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
            content: <NodeInspector />,
          },
          {
            value: "trace",
            label: (
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Trace</span>
              </span>
            ),
            content: <TracePanel />,
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
