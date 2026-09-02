import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Supported color theme preferences.
 */
export type ThemeMode = "dark" | "light" | "system";

/**
 * Inspector tab identifiers for the right hand panel.
 */
export type RightPanelTab = "code" | "inspector" | "trace";

/**
 * Panel dimension percentages and collapse flags.
 */
export interface WorkspacePanelSizes {
  readonly leftSidebarWidth: number;
  readonly rightPanelWidth: number;
  readonly isLeftSidebarCollapsed: boolean;
  readonly isRightPanelCollapsed: boolean;
}

/**
 * Persistent workspace attributes saved to browser storage.
 */
export interface WorkspacePersistentData extends WorkspacePanelSizes {
  readonly activeRightTab: RightPanelTab;
  readonly theme: ThemeMode;
}

/**
 * Complete workspace store state including actions and responsive flags.
 */
export interface WorkspaceLayoutState extends WorkspacePersistentData {
  readonly isHydrated: boolean;
  readonly isSmallScreen: boolean;
  readonly isLeftDrawerOpen: boolean;
  readonly isRightDrawerOpen: boolean;
  readonly setLeftSidebarWidth: (width: number) => void;
  readonly setRightPanelWidth: (width: number) => void;
  readonly toggleLeftSidebar: () => void;
  readonly toggleRightPanel: () => void;
  readonly setLeftSidebarCollapsed: (collapsed: boolean) => void;
  readonly setRightPanelCollapsed: (collapsed: boolean) => void;
  readonly setLeftDrawerOpen: (open: boolean) => void;
  readonly setRightDrawerOpen: (open: boolean) => void;
  readonly setActiveRightTab: (tab: RightPanelTab) => void;
  readonly setTheme: (theme: ThemeMode) => void;
  readonly setSmallScreen: (isSmall: boolean) => void;
  readonly setHydrated: () => void;
  readonly resetLayout: () => void;
}

const DEFAULT_LEFT_WIDTH = 20;
const DEFAULT_RIGHT_WIDTH = 35;

const DEFAULT_DATA: WorkspacePersistentData = {
  leftSidebarWidth: DEFAULT_LEFT_WIDTH,
  rightPanelWidth: DEFAULT_RIGHT_WIDTH,
  isLeftSidebarCollapsed: false,
  isRightPanelCollapsed: false,
  activeRightTab: "code",
  theme: "dark",
};

/**
 * Helper to synchronize the document theme class with active preference.
 */
export function applyThemeClass(theme: ThemeMode): void {
  if (typeof window === "undefined") {
    return;
  }
  const root = document.documentElement;
  let resolvedTheme = theme;
  if (theme === "system") {
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;
    resolvedTheme = prefersDark ? "dark" : "light";
  }
  if (resolvedTheme === "light") {
    root.classList.remove("dark");
    root.classList.add("light");
  } else {
    root.classList.remove("light");
    root.classList.add("dark");
  }
}

/**
 * Zustand store holding layout sizing, collapse flags, and active theme.
 */
export const useWorkspaceStore = create<WorkspaceLayoutState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_DATA,
      isHydrated: false,
      isSmallScreen: false,
      isLeftDrawerOpen: false,
      isRightDrawerOpen: false,

      setLeftSidebarWidth: (width: number) => {
        const clamped = Math.max(12, Math.min(40, width));
        set({ leftSidebarWidth: clamped });
      },

      setRightPanelWidth: (width: number) => {
        const clamped = Math.max(20, Math.min(50, width));
        set({ rightPanelWidth: clamped });
      },

      toggleLeftSidebar: () => {
        const current = get().isLeftSidebarCollapsed;
        set({ isLeftSidebarCollapsed: !current });
      },

      toggleRightPanel: () => {
        const current = get().isRightPanelCollapsed;
        set({ isRightPanelCollapsed: !current });
      },

      setLeftSidebarCollapsed: (collapsed: boolean) => {
        set({ isLeftSidebarCollapsed: collapsed });
      },

      setRightPanelCollapsed: (collapsed: boolean) => {
        set({ isRightPanelCollapsed: collapsed });
      },

      setLeftDrawerOpen: (open: boolean) => {
        set({ isLeftDrawerOpen: open });
      },

      setRightDrawerOpen: (open: boolean) => {
        set({ isRightDrawerOpen: open });
      },

      setActiveRightTab: (tab: RightPanelTab) => {
        set({ activeRightTab: tab });
      },

      setTheme: (theme: ThemeMode) => {
        applyThemeClass(theme);
        set({ theme });
      },

      setSmallScreen: (isSmall: boolean) => {
        set({ isSmallScreen: isSmall });
      },

      setHydrated: () => {
        set({ isHydrated: true });
      },

      resetLayout: () => {
        set({
          leftSidebarWidth: DEFAULT_LEFT_WIDTH,
          rightPanelWidth: DEFAULT_RIGHT_WIDTH,
          isLeftSidebarCollapsed: false,
          isRightPanelCollapsed: false,
          activeRightTab: "code",
        });
      },
    }),
    {
      name: "codebase-visualizer-workspace",
      partialize: (state) => ({
        leftSidebarWidth: state.leftSidebarWidth,
        rightPanelWidth: state.rightPanelWidth,
        isLeftSidebarCollapsed: state.isLeftSidebarCollapsed,
        isRightPanelCollapsed: state.isRightPanelCollapsed,
        activeRightTab: state.activeRightTab,
        theme: state.theme,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.setHydrated();
          applyThemeClass(state.theme);
        }
      },
    },
  ),
);
