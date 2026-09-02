"use client";

import React, { useState } from "react";
import {
  Folder,
  FileCode,
  Search,
  Layers,
  Code2,
  Sparkles,
  GitBranch,
} from "lucide-react";
import { WorkspaceLayout } from "@/components/layout";
import { Input, Badge, Tabs } from "@/components/ui";
import { GraphControlsToolbar } from "@/components/canvas";
import { useWorkspaceStore } from "@/stores/workspace-store";

export default function Home(): React.JSX.Element {
  const [zoom, setZoom] = useState(1.0);
  const [isMinimapVisible, setIsMinimapVisible] = useState(true);
  const activeRightTab = useWorkspaceStore((state) => state.activeRightTab);
  const setActiveRightTab = useWorkspaceStore(
    (state) => state.setActiveRightTab,
  );

  const leftContent = (
    <div className="p-3 flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-[var(--accent-primary)]" />
          <span className="text-xs font-semibold text-[var(--text-primary)]">
            main
          </span>
        </div>
        <Badge variant="accent">v0.1.0</Badge>
      </div>

      <Input
        icon={Search}
        placeholder="Filter files..."
        aria-label="Filter repository files"
      />

      <div className="flex-1 overflow-auto space-y-1 text-xs">
        <div className="flex items-center gap-2 px-2 py-1.5 rounded text-[var(--text-primary)] bg-[var(--surface-hover)] cursor-pointer">
          <Folder className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          <span className="font-medium">src</span>
        </div>
        <div className="pl-4 space-y-1">
          <div className="flex items-center justify-between px-2 py-1 rounded text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] cursor-pointer">
            <div className="flex items-center gap-2">
              <FileCode className="w-3.5 h-3.5 text-[var(--syntax-ts)]" />
              <span>index.ts</span>
            </div>
            <Badge variant="syntax-ts">.ts</Badge>
          </div>
          <div className="flex items-center justify-between px-2 py-1 rounded text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] cursor-pointer">
            <div className="flex items-center gap-2">
              <FileCode className="w-3.5 h-3.5 text-[var(--syntax-ts)]" />
              <span>graph.ts</span>
            </div>
            <Badge variant="syntax-ts">.ts</Badge>
          </div>
        </div>
      </div>
    </div>
  );

  const centerContent = (
    <div className="relative w-full h-full flex flex-col items-center justify-center p-8 bg-[var(--surface-canvas)]">
      {/* Top right canvas controls toolbar */}
      <div className="absolute top-3 right-3 z-20">
        <GraphControlsToolbar
          onZoomIn={() => setZoom((z) => Math.min(2.0, z + 0.1))}
          onZoomOut={() => setZoom((z) => Math.max(0.5, z - 0.1))}
          onFitView={() => setZoom(1.0)}
          isMinimapVisible={isMinimapVisible}
          onToggleMinimap={() => setIsMinimapVisible(!isMinimapVisible)}
          currentZoom={zoom}
        />
      </div>

      {/* Main workspace title and intro card */}
      <div className="max-w-xl text-center space-y-4 z-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--surface-panel-secondary)] border border-[var(--border-default)] text-xs text-[var(--text-secondary)] mb-2">
          <Sparkles className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
          <span>Interactive architecture map canvas</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl text-[var(--text-primary)]">
          Codebase Visualizer
        </h1>
        <p className="text-sm text-[var(--text-secondary)] max-w-md mx-auto leading-relaxed">
          Explore complex repository architectures with dense split screen
          navigation, semantic syntax tokens, and interactive canvas inspection.
        </p>

        <div className="pt-2 flex justify-center items-center gap-2">
          <Badge variant="syntax-ts">Next.js 15</Badge>
          <Badge variant="syntax-fn">TypeScript 5</Badge>
          <Badge variant="syntax-class">Tailwind CSS v4</Badge>
        </div>
      </div>
    </div>
  );

  const rightContent = (
    <div className="w-full h-full flex flex-col">
      <Tabs
        value={activeRightTab}
        onValueChange={(val) =>
          setActiveRightTab(val as "code" | "inspector" | "trace")
        }
        items={[
          {
            value: "code",
            label: (
              <span className="flex items-center gap-1.5">
                <Code2 className="w-3.5 h-3.5" />
                <span>Code</span>
              </span>
            ),
            content: (
              <div className="p-4 text-xs font-mono text-[var(--text-secondary)] space-y-2">
                <div className="text-[var(--text-muted)]">
                  {"// Select a node to view source"}
                </div>
                <div className="p-3 rounded-md bg-[var(--surface-canvas)] border border-[var(--border-subtle)] text-[var(--text-muted)]">
                  No symbol selected
                </div>
              </div>
            ),
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
              <div className="p-4 text-xs text-[var(--text-secondary)] space-y-3">
                <div className="text-xs font-semibold text-[var(--text-primary)]">
                  Node Details
                </div>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Click any node on the graph canvas to inspect declarations,
                  incoming imports, and callers.
                </p>
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
                  Semantic path tracer between modules.
                </p>
              </div>
            ),
          },
        ]}
      />
    </div>
  );

  return (
    <WorkspaceLayout
      leftContent={leftContent}
      centerContent={centerContent}
      rightContent={rightContent}
    />
  );
}
