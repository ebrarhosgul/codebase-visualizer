import { describe, it, expect, beforeEach } from "vitest";
import { useWorkspaceStore, applyThemeClass } from "../workspace-store";

describe("useWorkspaceStore", () => {
  beforeEach(() => {
    useWorkspaceStore.getState().resetLayout();
    localStorage.clear();
  });

  it("initializes with default panel sizes and tabs", () => {
    const state = useWorkspaceStore.getState();
    expect(state.leftSidebarWidth).toBe(20);
    expect(state.rightPanelWidth).toBe(35);
    expect(state.isLeftSidebarCollapsed).toBe(false);
    expect(state.isRightPanelCollapsed).toBe(false);
    expect(state.activeRightTab).toBe("code");
    expect(state.theme).toBe("dark");
  });

  it("clamps left sidebar width between 12 and 40", () => {
    useWorkspaceStore.getState().setLeftSidebarWidth(5);
    expect(useWorkspaceStore.getState().leftSidebarWidth).toBe(12);

    useWorkspaceStore.getState().setLeftSidebarWidth(50);
    expect(useWorkspaceStore.getState().leftSidebarWidth).toBe(40);

    useWorkspaceStore.getState().setLeftSidebarWidth(25);
    expect(useWorkspaceStore.getState().leftSidebarWidth).toBe(25);
  });

  it("clamps right panel width between 20 and 50", () => {
    useWorkspaceStore.getState().setRightPanelWidth(10);
    expect(useWorkspaceStore.getState().rightPanelWidth).toBe(20);

    useWorkspaceStore.getState().setRightPanelWidth(65);
    expect(useWorkspaceStore.getState().rightPanelWidth).toBe(50);

    useWorkspaceStore.getState().setRightPanelWidth(30);
    expect(useWorkspaceStore.getState().rightPanelWidth).toBe(30);
  });

  it("toggles left sidebar collapse state", () => {
    expect(useWorkspaceStore.getState().isLeftSidebarCollapsed).toBe(false);
    useWorkspaceStore.getState().toggleLeftSidebar();
    expect(useWorkspaceStore.getState().isLeftSidebarCollapsed).toBe(true);
    useWorkspaceStore.getState().toggleLeftSidebar();
    expect(useWorkspaceStore.getState().isLeftSidebarCollapsed).toBe(false);
  });

  it("toggles right panel collapse state", () => {
    expect(useWorkspaceStore.getState().isRightPanelCollapsed).toBe(false);
    useWorkspaceStore.getState().toggleRightPanel();
    expect(useWorkspaceStore.getState().isRightPanelCollapsed).toBe(true);
    useWorkspaceStore.getState().toggleRightPanel();
    expect(useWorkspaceStore.getState().isRightPanelCollapsed).toBe(false);
  });

  it("updates active right tab", () => {
    useWorkspaceStore.getState().setActiveRightTab("inspector");
    expect(useWorkspaceStore.getState().activeRightTab).toBe("inspector");
    useWorkspaceStore.getState().setActiveRightTab("trace");
    expect(useWorkspaceStore.getState().activeRightTab).toBe("trace");
  });

  it("sets small screen flag and drawer visibility", () => {
    useWorkspaceStore.getState().setSmallScreen(true);
    expect(useWorkspaceStore.getState().isSmallScreen).toBe(true);

    useWorkspaceStore.getState().setLeftDrawerOpen(true);
    expect(useWorkspaceStore.getState().isLeftDrawerOpen).toBe(true);

    useWorkspaceStore.getState().setRightDrawerOpen(true);
    expect(useWorkspaceStore.getState().isRightDrawerOpen).toBe(true);
  });

  it("applies theme classes to document root", () => {
    applyThemeClass("light");
    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    applyThemeClass("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("light")).toBe(false);
  });
});
