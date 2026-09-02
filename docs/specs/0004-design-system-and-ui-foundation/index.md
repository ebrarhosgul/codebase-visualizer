# 0004. Design System and UI Foundation

**Date**: 2026-09-02
**Status**: In Progress

## Summary

This specification establishes the design system and user interface foundation for Codebase Visualizer. It defines semantic color tokens tuned for dark mode developer workspaces, resizable split screen layout primitives, and accessible component building blocks. Adopting these primitives ensures that subsequent graph visualization and code inspection features build on consistent styling, smooth panel management, and keyboard friendly controls.

## Requirements

**User stories**:
- As a developer exploring unfamiliar repositories, I want a dense developer styled split workspace so that I can view the graph canvas and source code side by side without losing visual context.
- As an engineer reading complex codebases for hours, I want dark mode first styling with high contrast tokens and clear typography so that I can inspect modules comfortably without eye strain.
- As a power user navigating with a keyboard, I want accessible panel resizing, collapsible sidebars, and navigable dialogs so that I can control my workspace efficiently without relying entirely on a mouse.

**Acceptance criteria**:
- **AC-1**: Dark mode first color token architecture. The design system defines semantic CSS variables for surfaces, text hierarchy, borders, interactive states, and syntax accents, with dark mode as the default and clean structure for light mode tokens. An inline head script prevents flash of unstyled theme on initial load.
- **AC-2**: Resizable split pane layout. The workspace provides a flexible three pane layout using `react-resizable-panels` with collapsible left navigation, center graph canvas, right inspector or code pane, and persistent layout sizing stored in `localStorage`.
- **AC-3**: Keyboard and accessibility compliance. All interactive primitives including split pane drag handles, buttons, dialogs, tabs, and dropdown menus meet WCAG AA standards, including visible focus rings, ARIA roles, and keyboard navigation. Collapsing a panel safely transfers keyboard focus to the expand toggle.
- **AC-4**: Developer typography scale. The system establishes typography tokens pairing Geist Sans for user interface labels and Geist Mono for code, telemetry, and coordinates, configured via `next/font/google` with fixed density line heights.
- **AC-5**: React Flow theme and custom node styling. Canvas styles define custom dark slate cards with file type accent badges, collapsible node details, syntax highlighted tags, custom minimap styling, and accessible zoom and pan controls.
- **AC-6**: Base component foundation. The user interface library exports accessible unstyled Radix primitives wrapped with Tailwind CSS tokens, including Button, IconButton, Badge, Input, Tooltip (`@radix-ui/react-tooltip`), Dialog (`@radix-ui/react-dialog`), Tabs (`@radix-ui/react-tabs`), and DropdownMenu (`@radix-ui/react-dropdown-menu`).
- **AC-7**: Workspace layout state store. A dedicated Zustand store with `partialize` filtering persists panel sizes, collapsed states, active tabs, and theme preferences to browser storage with hydration mismatch prevention.
- **AC-8**: Living design token documentation. A canonical `docs/design.md` file records color tokens, spacing scales, typography pairings, component states, and accessibility rules for all subsequent feature slices.
- **AC-9**: Responsive small screen fallback. On viewports narrower than 860px where three concurrent panes cannot fit, the layout automatically converts side panels into slide over overlay drawers so the graph canvas remains uncompressed.

## Decision

**Chosen option**: Option 1: Tailored Tailwind CSS v4 design tokens with react-resizable-panels, Radix UI headless primitives, and Zustand layout persistence.

We choose a dark mode first design system built on native Tailwind CSS v4 theme variables, accessible split panes using `react-resizable-panels`, unstyled headless primitives using Radix UI, and layout state persistence using Zustand. This architecture delivers high density split screen layouts without heavy CSS runtime overhead while guaranteeing keyboard accessibility and smooth resizing performance.

## Rationale

Reasoning, options considered, and forces: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**:

```typescript
export type ThemeMode = 'dark' | 'light' | 'system';

export type RightPanelTab = 'code' | 'inspector' | 'trace';

export interface WorkspacePanelSizes {
  readonly leftSidebarWidth: number; // percentage (e.g. 20)
  readonly rightPanelWidth: number; // percentage (e.g. 35)
  readonly isLeftSidebarCollapsed: boolean;
  readonly isRightPanelCollapsed: boolean;
}

export interface WorkspacePersistentData extends WorkspacePanelSizes {
  readonly activeRightTab: RightPanelTab;
  readonly theme: ThemeMode;
}

export interface WorkspaceLayoutState extends WorkspacePersistentData {
  readonly isHydrated: boolean;
  readonly isSmallScreen: boolean;
  readonly setLeftSidebarWidth: (width: number) => void;
  readonly setRightPanelWidth: (width: number) => void;
  readonly toggleLeftSidebar: () => void;
  readonly toggleRightPanel: () => void;
  readonly setActiveRightTab: (tab: RightPanelTab) => void;
  readonly setTheme: (theme: ThemeMode) => void;
  readonly setSmallScreen: (isSmall: boolean) => void;
  readonly setHydrated: () => void;
  readonly resetLayout: () => void;
}
```

**State transitions**:

Layout state transitions are managed inside the client Zustand store with automatic persistence to browser `localStorage` using the `partialize` configuration to store only data attributes:
- Initial server load: Default layout percentages (left: 20%, center: 45%, right: 35%) render during server compilation.
- Client hydration: The client store activates `isHydrated: true` after mount, seamlessly restoring persisted dimensions without server markup mismatches.
- Panel collapse: When the user collapses a panel, the width animates to zero and the store records the collapse flag while retaining the previous non zero width for restoration. Focus shifts to the expand control button.
- Panel restore: Restoring an uncollapsed panel snaps back to the previously stored width percentage smoothly.
- Responsive breakpoint (< 860px): On screens narrower than 860px, the layout store activates `isSmallScreen: true`. The left file tree and right code panels become overlay drawers toggled on demand, leaving the full viewport width for the graph canvas.

**API surface**:

| Component or Hook | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|
| `WorkspaceLayout` | `leftContent: ReactNode`, `centerContent: ReactNode`, `rightContent: ReactNode` | `JSX.Element` | Public | Invalid pane percentage sum |
| `ResizableSplitPane` | `direction: 'horizontal' \| 'vertical'`, `panels: PanelConfig[]`, `onResize?: (sizes: number[]) => void` | `JSX.Element` | Public | Children count mismatch |
| `useWorkspaceStore` | `selector: (state: WorkspaceLayoutState) => T` | Selected state slice | Public | Store hydration mismatch |
| `Button` | `variant: 'primary' \| 'secondary' \| 'ghost' \| 'danger'`, `size: 'sm' \| 'md' \| 'lg'`, `disabled?: boolean`, `loading?: boolean` | `JSX.Element` | Public | Unsupported variant name |
| `IconButton` | `icon: LucideIcon`, `label: string`, `variant?: ButtonVariant`, `size?: 'sm' \| 'md'` | `JSX.Element` | Public | Missing accessible label |
| `Badge` | `variant: 'default' \| 'success' \| 'warning' \| 'error' \| 'info' \| 'accent'`, `children: ReactNode` | `JSX.Element` | Public | None |
| `Tooltip` | `content: ReactNode`, `children: ReactNode`, `side?: 'top' \| 'right' \| 'bottom' \| 'left'` | `JSX.Element` | Public | Missing trigger element |
| `Dialog` | `open: boolean`, `onOpenChange: (open: boolean) => void`, `title: string`, `children: ReactNode` | `JSX.Element` | Public | Focus trap escape |
| `Tabs` | `value: string`, `onValueChange: (val: string) => void`, `items: TabItem[]` | `JSX.Element` | Public | Unmatched tab value |
| `DropdownMenu` | `trigger: ReactNode`, `items: MenuItem[]` | `JSX.Element` | Public | Keyboard dismiss failure |
| `GraphControlsToolbar` | `onZoomIn: () => void`, `onZoomOut: () => void`, `onFitView: () => void`, `isMinimapVisible: boolean`, `onToggleMinimap: () => void` | `JSX.Element` | Public | Canvas instance unavailable |

**Value sourcing**:

| Action | Value produced or displayed | Source |
|---|---|---|
| Workspace layout initialization | Panel widths and collapse flags | `localStorage` key `codebase-visualizer-workspace` via Zustand `partialize` |
| Theme application | Active color palette and CSS variables | `localStorage` key `codebase-visualizer-theme` verified by inline head script |
| Split pane handle drag | Real time panel width percentages | `react-resizable-panels` resize event coordinates |
| Tab selection | Active inspector view | Zustand workspace store `activeRightTab` state |
| Responsive mode check | Drawer mode versus split pane mode | `window.matchMedia('(max-width: 859px)')` event listener |
| Graph node card render | Node title, badge color, and file path | Canonical `CodebaseGraph` symbol and file node attributes |
| Keyboard navigation | Active focused element outline | CSS `:focus-visible` styling tokens |
| Accessible announcements | Screen reader descriptions | ARIA attributes (`aria-label`, `aria-expanded`, `aria-controls`) |

**Key invariants**:
- Contrast compliance: All text color tokens against background surfaces must maintain at least a 4.5:1 contrast ratio, and non text UI borders must maintain at least 3:1.
- Minimum canvas visibility: Split resizing logic enforces a minimum width of 400px for the center graph canvas on desktop screens.
- Zero flash theme initialization: An inline script placed before the body tag reads user theme preference and sets the `dark` class on `document.documentElement` before rendering begins.
- Client storage hydration safety: The Zustand store uses safe hydration flags so initial server rendered HTML matches client hydration before reading `localStorage`. Action functions are excluded from storage via `partialize`.
- Responsive protection: Viewports narrower than 860px switch panels from horizontal split columns to slide over drawers, preventing pane collapse collision.
- Pure Tailwind tokens: Color values remain defined in CSS custom properties within `src/app/globals.css`, avoiding hardcoded arbitrary hex values inside component templates.

**Security model**:
- All styling and layout operations run client side in the browser.
- No user tokens or private repository data are handled or exposed by the design system.
- Component props do not evaluate raw HTML strings, avoiding cross site scripting risks.

**Configuration required**:
- None.

**Critical test scenarios**:
- Happy path: Rendering the workspace split panes, toggling sidebar collapse, and resizing panels updates panel sizes and persists values to storage, verifies **AC-2**, **AC-7**.
- Theme switching and token rendering: Applying theme tokens renders dark slate palette with compliant contrast ratios, verifies **AC-1**, **AC-4**.
- Keyboard navigation and focus trap: Navigating split pane drag handles with arrow keys and opening dialogs traps focus and closes with the Escape key, verifies **AC-3**, **AC-6**.
- Responsive drawer transition: Shrinking screen width below 860px switches panels to overlay drawer mode, verifies **AC-9**.
- React Flow canvas styling: Custom graph nodes render syntax colored badges and respond to zoom and fit view actions, verifies **AC-5**.

## Build plan

Ordered build tasks following the Tracer Bullet delivery approach:

1. [x] Create semantic color tokens, typography scales, theme flash script, and CSS variables in Tailwind CSS v4 and `src/app/globals.css`, satisfies **AC-1**, **AC-4**
2. [x] Establish the canonical design specification document in `docs/design.md` covering tokens, spacing, and component states, satisfies **AC-8**
3. [x] Construct the workspace layout Zustand store with `partialize` persistence, hydration guards, and responsive breakpoint listeners (`src/stores/workspace-store.ts`), satisfies **AC-7**, **AC-9**
4. [x] Install `react-resizable-panels`, `lucide-react`, and `clsx`, and build the `ResizableSplitPane` workspace layout with responsive drawer fallbacks (`src/components/layout/`), satisfies **AC-2**, **AC-3**, **AC-9**
5. [x] Install `@radix-ui/react-dialog`, `@radix-ui/react-tooltip`, `@radix-ui/react-tabs`, and `@radix-ui/react-dropdown-menu`, and implement base interactive component primitives (`src/components/ui/`), satisfies **AC-3**, **AC-6**
6. [x] Build React Flow custom node cards, syntax badge indicators, minimap styling, and canvas controls bar (`src/components/canvas/`), satisfies **AC-5**
7. [x] Write unit and component test suite verifying panel persistence, responsive breakpoints, keyboard accessibility, contrast ratios, and component rendering (`src/components/__tests__/`), satisfies **AC-1**, **AC-2**, **AC-3**, **AC-5**, **AC-6**, **AC-7**, **AC-9**

## Consequences

**Positive**:
- A dedicated design system gives all future slices a consistent visual language and eliminates ad hoc styling decisions.
- Using `react-resizable-panels` provides accessible drag handles with built in keyboard resizing out of the box.
- Storing layout state in Zustand allows any component to read panel collapse status or trigger layout changes without prop drilling.
- Semantic CSS variables make supporting alternative themes or high contrast modes straightforward.
- Inline theme script eliminates unstyled white flashes when dark mode developers open the application.
- Responsive drawer fallback ensures the application remains usable on smaller laptop and tablet viewports.

**Negative / tradeoffs**:
- Introducing `react-resizable-panels` and Radix UI primitives adds small external dependencies to the client bundle.
- Dense layout styling requires disciplined use of typography and padding tokens to avoid visual clutter.

**Neutral**:
- Future slices adding Monaco Editor will need to configure editor themes to match the semantic slate color palette.

## Follow-up

- [ ] Align Monaco Editor syntax highlighting theme with the slate palette in Slice 1.
- [ ] Connect repository tree nodes to the left sidebar in Slice 1.
- [ ] Connect selected graph node inspection drawer to the right panel in Slice 2.
