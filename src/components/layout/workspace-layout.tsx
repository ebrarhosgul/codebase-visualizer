"use client";

import React, { useRef, useEffect } from "react";
import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  FolderTree,
  Code2,
  X,
} from "lucide-react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useResponsiveWorkspace } from "@/hooks/use-responsive-workspace";
import { ResizableSplitPane, type PanelConfig } from "./resizable-split-pane";
import { cn } from "@/lib/utils";

/**
 * Properties for the primary workspace layout container.
 */
export interface WorkspaceLayoutProps {
  readonly headerContent?: React.ReactNode;
  readonly leftContent: React.ReactNode;
  readonly centerContent: React.ReactNode;
  readonly rightContent: React.ReactNode;
  readonly className?: string;
}

/**
 * Dense three pane developer workspace with keyboard accessible resizing,
 * panel collapse states, and small screen drawer fallbacks.
 */
export function WorkspaceLayout({
  headerContent,
  leftContent,
  centerContent,
  rightContent,
  className,
}: WorkspaceLayoutProps): React.JSX.Element {
  useResponsiveWorkspace();

  const isSmallScreen = useWorkspaceStore((state) => state.isSmallScreen);
  const leftSidebarWidth = useWorkspaceStore((state) => state.leftSidebarWidth);
  const rightPanelWidth = useWorkspaceStore((state) => state.rightPanelWidth);
  const isLeftCollapsed = useWorkspaceStore(
    (state) => state.isLeftSidebarCollapsed,
  );
  const isRightCollapsed = useWorkspaceStore(
    (state) => state.isRightPanelCollapsed,
  );
  const toggleLeftSidebar = useWorkspaceStore(
    (state) => state.toggleLeftSidebar,
  );
  const toggleRightPanel = useWorkspaceStore((state) => state.toggleRightPanel);
  const setLeftSidebarWidth = useWorkspaceStore(
    (state) => state.setLeftSidebarWidth,
  );
  const setRightPanelWidth = useWorkspaceStore(
    (state) => state.setRightPanelWidth,
  );
  const isLeftDrawerOpen = useWorkspaceStore((state) => state.isLeftDrawerOpen);
  const isRightDrawerOpen = useWorkspaceStore(
    (state) => state.isRightDrawerOpen,
  );
  const setLeftDrawerOpen = useWorkspaceStore(
    (state) => state.setLeftDrawerOpen,
  );
  const setRightDrawerOpen = useWorkspaceStore(
    (state) => state.setRightDrawerOpen,
  );

  const expandLeftButtonRef = useRef<HTMLButtonElement>(null);
  const expandRightButtonRef = useRef<HTMLButtonElement>(null);
  const prevLeftCollapsedRef = useRef(isLeftCollapsed);
  const prevRightCollapsedRef = useRef(isRightCollapsed);

  // Transfer keyboard focus when collapsing panels
  useEffect(() => {
    if (!prevLeftCollapsedRef.current && isLeftCollapsed) {
      expandLeftButtonRef.current?.focus();
    }
    prevLeftCollapsedRef.current = isLeftCollapsed;
  }, [isLeftCollapsed]);

  useEffect(() => {
    if (!prevRightCollapsedRef.current && isRightCollapsed) {
      expandRightButtonRef.current?.focus();
    }
    prevRightCollapsedRef.current = isRightCollapsed;
  }, [isRightCollapsed]);

  // Handle escape key closing overlay drawers on small screens
  useEffect(() => {
    if (!isSmallScreen) {
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isLeftDrawerOpen) {
          setLeftDrawerOpen(false);
        }
        if (isRightDrawerOpen) {
          setRightDrawerOpen(false);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    isSmallScreen,
    isLeftDrawerOpen,
    isRightDrawerOpen,
    setLeftDrawerOpen,
    setRightDrawerOpen,
  ]);

  // Small screen overlay drawer mode
  if (isSmallScreen) {
    return (
      <div
        className={cn(
          "relative w-screen h-screen overflow-hidden flex flex-col bg-[var(--surface-canvas)]",
          className,
        )}
      >
        {/* Mobile quick action bar */}
        <header className="h-11 px-3 border-b border-[var(--border-subtle)] bg-[var(--surface-panel)] flex items-center justify-between shrink-0 z-20">
          <button
            type="button"
            onClick={() => setLeftDrawerOpen(true)}
            className="flex items-center gap-1.5 px-2 py-1 text-xs rounded font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-[var(--border-focus)]"
            aria-label="Open repository tree drawer"
            aria-expanded={isLeftDrawerOpen}
          >
            <FolderTree className="w-4 h-4 text-[var(--accent-primary)]" />
            <span>Files</span>
          </button>

          <span className="text-xs font-semibold tracking-wide text-[var(--text-primary)]">
            Codebase Visualizer
          </span>

          <button
            type="button"
            onClick={() => setRightDrawerOpen(true)}
            className="flex items-center gap-1.5 px-2 py-1 text-xs rounded font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-[var(--border-focus)]"
            aria-label="Open inspector and code drawer"
            aria-expanded={isRightDrawerOpen}
          >
            <Code2 className="w-4 h-4 text-[var(--accent-primary)]" />
            <span>Inspector</span>
          </button>
        </header>

        {headerContent && (
          <div className="p-2 border-b border-[var(--border-subtle)] bg-[var(--surface-panel-secondary)] shrink-0 z-10">
            {headerContent}
          </div>
        )}

        {/* Center graph canvas taking uncompressed viewport */}
        <main
          className="flex-1 relative overflow-hidden"
          role="main"
          aria-label="Architecture graph canvas"
        >
          {centerContent}
        </main>

        {/* Left slide over drawer */}
        {isLeftDrawerOpen && (
          <div
            className="fixed inset-0 z-50 flex"
            role="dialog"
            aria-modal="true"
            aria-label="Repository navigation"
          >
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
              onClick={() => setLeftDrawerOpen(false)}
              aria-hidden="true"
            />
            <div className="relative w-4/5 max-w-sm h-full bg-[var(--surface-panel)] border-r border-[var(--border-default)] shadow-xl flex flex-col z-10">
              <div className="h-11 px-3 border-b border-[var(--border-subtle)] flex items-center justify-between shrink-0">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                  Files & Folders
                </span>
                <button
                  type="button"
                  onClick={() => setLeftDrawerOpen(false)}
                  className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-[var(--border-focus)]"
                  aria-label="Close navigation drawer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-auto">{leftContent}</div>
            </div>
          </div>
        )}

        {/* Right slide over drawer */}
        {isRightDrawerOpen && (
          <div
            className="fixed inset-0 z-50 flex justify-end"
            role="dialog"
            aria-modal="true"
            aria-label="Inspector and code pane"
          >
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
              onClick={() => setRightDrawerOpen(false)}
              aria-hidden="true"
            />
            <div className="relative w-5/6 max-w-md h-full bg-[var(--surface-panel)] border-l border-[var(--border-default)] shadow-xl flex flex-col z-10">
              <div className="h-11 px-3 border-b border-[var(--border-subtle)] flex items-center justify-between shrink-0">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                  Code & Details
                </span>
                <button
                  type="button"
                  onClick={() => setRightDrawerOpen(false)}
                  className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-[var(--border-focus)]"
                  aria-label="Close inspector drawer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                {rightContent}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Desktop split pane layout
  const panels: PanelConfig[] = [];

  if (!isLeftCollapsed) {
    panels.push({
      id: "left-sidebar",
      defaultSize: leftSidebarWidth,
      minSize: 12,
      maxSize: 35,
      ariaLabel: "Repository file navigation",
      content: (
        <aside className="w-full h-full flex flex-col bg-[var(--surface-panel)] border-r border-[var(--border-subtle)]">
          <div className="h-9 px-3 border-b border-[var(--border-subtle)] flex items-center justify-between shrink-0">
            <span className="text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">
              Explorer
            </span>
            <button
              type="button"
              onClick={toggleLeftSidebar}
              className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-[var(--border-focus)]"
              aria-label="Collapse explorer panel"
            >
              <PanelLeftClose className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex-1 overflow-auto">{leftContent}</div>
        </aside>
      ),
    });
  }

  // Calculate center canvas percentage
  const effectiveLeft = isLeftCollapsed ? 0 : leftSidebarWidth;
  const effectiveRight = isRightCollapsed ? 0 : rightPanelWidth;
  const centerSize = Math.max(30, 100 - effectiveLeft - effectiveRight);

  panels.push({
    id: "center-canvas",
    defaultSize: centerSize,
    minSize: 30,
    ariaLabel: "Architecture graph canvas",
    content: (
      <main
        className="relative w-full h-full overflow-hidden bg-[var(--surface-canvas)] flex flex-col"
        role="main"
      >
        {/* Floating toggles when panels are collapsed */}
        {isLeftCollapsed && (
          <button
            ref={expandLeftButtonRef}
            type="button"
            onClick={toggleLeftSidebar}
            className="absolute top-3 left-3 z-30 p-1.5 rounded-md bg-[var(--surface-panel)] border border-[var(--border-default)] shadow-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-[var(--border-focus)] transition-colors"
            aria-label="Expand explorer panel"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
        )}

        {isRightCollapsed && (
          <button
            ref={expandRightButtonRef}
            type="button"
            onClick={toggleRightPanel}
            className="absolute top-3 right-3 z-30 p-1.5 rounded-md bg-[var(--surface-panel)] border border-[var(--border-default)] shadow-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-[var(--border-focus)] transition-colors"
            aria-label="Expand inspector panel"
          >
            <PanelRightOpen className="w-4 h-4" />
          </button>
        )}

        <div className="w-full h-full">{centerContent}</div>
      </main>
    ),
  });

  if (!isRightCollapsed) {
    panels.push({
      id: "right-inspector",
      defaultSize: rightPanelWidth,
      minSize: 20,
      maxSize: 50,
      ariaLabel: "Code and symbol inspector",
      content: (
        <aside className="w-full h-full flex flex-col bg-[var(--surface-panel)] border-l border-[var(--border-subtle)]">
          <div className="h-9 px-3 border-b border-[var(--border-subtle)] flex items-center justify-between shrink-0">
            <span className="text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">
              Inspector
            </span>
            <button
              type="button"
              onClick={toggleRightPanel}
              className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-[var(--border-focus)]"
              aria-label="Collapse inspector panel"
            >
              <PanelRightClose className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {rightContent}
          </div>
        </aside>
      ),
    });
  }

  return (
    <div
      className={cn(
        "w-screen h-screen overflow-hidden flex flex-col bg-[var(--surface-canvas)]",
        className,
      )}
    >
      {headerContent && (
        <header className="min-h-12 h-auto border-b border-[var(--border-subtle)] bg-[var(--surface-panel)] flex flex-col justify-center px-4 py-1.5 shrink-0 z-20">
          {headerContent}
        </header>
      )}
      <div className="flex-1 min-h-0 relative">
        <ResizableSplitPane
          direction="horizontal"
          panels={panels}
          onResize={(sizes) => {
            if (!isLeftCollapsed && sizes[0] !== undefined) {
              setLeftSidebarWidth(sizes[0]);
            }
            if (!isRightCollapsed) {
              const rightIndex = panels.length - 1;
              const rightSize = sizes[rightIndex];
              if (rightSize !== undefined) {
                setRightPanelWidth(rightSize);
              }
            }
          }}
        />
      </div>
    </div>
  );
}
