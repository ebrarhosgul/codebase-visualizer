# 0004. Design System and UI Foundation

**Date**: 2026-09-02
**Status**: Accepted

The status above records the shipped foundation. The proposed overhaul below has its own status and does not change the meaning of the completed foundation work or its verification record.

## Proposed design system overhaul

**Date**: 2026-11-20
**Status**: Proposed
**Scope**: Slice 10, Design system overhaul

### Summary

Refresh the existing workspace to follow `docs/design.md` in both themes. Keep the current workspace behavior and libraries, and migrate the interface in small complete slices. The guide defines the target values and visual direction; CSS custom properties hold the implemented values.

### Requirements

- **OAC-1**: Both themes use the semantic colors, typography, spacing, shape, elevation, and motion rules in `docs/design.md`. Dark remains the default and the existing theme preference continues to work. Check real foreground and background pairs: normal text reaches 4.5 to 1, large text 3 to 1, and essential control boundaries and state indicators 3 to 1 against adjacent colors.
- **OAC-2**: The workspace, shared controls, menus, dialogs, notices, trace panel, editor surround, and graph controls follow the guide. Remove redundant decoration and labels without removing useful information or actions. Empty, loading, and error states explain the situation and offer a relevant next action where one exists.
- **OAC-3**: Graph nodes, folder groups, minimap, edges, selection, and relationship highlights follow the guide in both themes. A selected item and relationship remain identifiable without color alone. Preserve graph navigation, filtering, tracing, node selection, and source linking.
- **OAC-4**: The editor uses a legible theme matching the active workspace theme. Preserve syntax highlighting, source navigation, and the existing font size preference.
- **OAC-5**: Keyboard focus is visible and unobscured. Controls retain accessible names and keyboard behavior, dialogs and drawers return focus, and small screen layouts preserve the current selection. Respect reduced motion and the target sizes described in the guide.
- **OAC-6**: Preserve viewport pruning, node specific updates, and progressive disclosure from spec 0011. On the same graph with hundreds of nodes and the same browser and machine, record before and after traces of pan, zoom, selection, and streaming. Assess the 60 FPS goal and visible stutter against spec 0011, investigate regressions, and record the fixture, environment, results, and any unmet target. A missed target is not a pass.
- **OAC-7**: Update the design guide and central tokens together if implementation reveals a necessary change. Audit actual component usage, including inline React Flow and Monaco styles, so obsolete palette values and visual rules do not persist in the migrated surfaces.

For migrated surfaces, OAC-1 replaces the foundation's broader contrast wording: decorative separators need not meet the control boundary threshold, and large text may use the stated 3 to 1 threshold. The rest of the foundation remains in force unless this overhaul explicitly changes it.

### Decision and boundaries

**Chosen option**: Update the existing semantic tokens and components in place, using the current Tailwind CSS, Radix, React Flow, Monaco, and Zustand integration. The runner up is a parallel replacement component library; it adds migration and styling overhead without addressing the inline canvas and editor styles.

**Implementation skills**: `modern-web-guidance` (`~/.gemini/config/plugins/modern-web-guidance-plugin/skills/modern-web-guidance/`), for web interface and accessibility guidance.

This is a visual and interaction quality change. It does not add a data model, API, authentication rule, environment variable, or new persistence format. Keep existing stored theme and layout preferences, public component behavior, and graph data contracts. Do not introduce a new component framework or a feature flag solely for this change. Each completed slice can be reverted through its changes in version control.

### Implementation contract

| Surface | Source and required behavior |
|---|---|
| Colors and scales | `docs/design.md` supplies target values; `src/app/globals.css` supplies runtime semantic variables. Map existing names deliberately and remove obsolete aliases only after their consumers migrate. |
| Shared interface | `src/components/ui/`, `layout/`, `workspace/`, and `trace/` consume semantic tokens. Keep accessible primitive behavior and existing functional states. |
| Graph | `src/components/canvas/` derives styles from the existing selected node, edge direction, active trace, and answer highlight state. Use an outline for selection, arrowheads for direction, and a solid wider stroke for traced edges. Selection remains outlined during a trace; a traced edge keeps its trace treatment while other edges are subdued. Follow the existing mutually exclusive trace and answer highlight lifecycle from spec 0013. Use theme aware values for nodes, edges, markers, minimap, and background. Remove animated dashes and glow effects. |
| Editor | Resolve the effective light or dark theme from the saved workspace preference, using the operating system preference for `system`. Apply the same resolution at first paint and react to operating system changes while `system` is selected. A central adapter maps semantic theme colors and legible syntax colors to Monaco theme definitions, including selection and loading states. |
| Responsive and motion | Preserve panel sizes and selection when switching layouts. At 859px use drawers; at 860px use the split workspace. Drawers retain focus management, and collapsing a panel containing focus moves it to its expand control. Suppress nonessential animation for reduced motion. |
| Failure and storage | Existing repository, loading, and error flows remain functional. Unavailable or invalid saved preferences fall back to existing safe defaults; the overhaul introduces no new stored fields. |

### Welcome canvas presentation

The welcome canvas refresh (2026-11-20) is part of OAC-2 and OAC-5. Center the introduction, illustration, supporting text, repository URL hint, and example section horizontally within the available canvas. Keep the content width constrained and allow vertical scrolling on short screens.

Use a small static inline SVG of connected code and file nodes above the introduction. It is decorative, hidden from assistive technology, and uses existing semantic colors with reserved dimensions. Keep the existing welcome copy and ingestion copy. While ingestion is active, show the existing loading message and hide the URL hint and example section.

Render the existing React and Next.js examples from `DEMO_REPOS`. Cards retain the existing `startIngestion` action, repository names, repository paths, and test identifiers. Use a semantic panel surface, violet icon inset, directional arrow, visible keyboard focus, and color changes on hover. Keep card contents left aligned for scanning while centering the overall example section.

Use the canvas width rather than the browser width for the card layout. At a canvas width of at least 32rem, show two equal columns. Below that width, stack the cards. Use the existing Geist fonts and theme tokens in both themes.

Keep the presentation limited to static markup and CSS. Add no dependencies, external images, font downloads, requests, timers, animation loops, or changes to graph computation and rendering. The illustration appears only in the empty canvas branch. These constraints limit added work but do not establish a measured performance result or complete OAC-6.

### Performance measurement

Use a headed production build with the same browser, machine, viewport, zoom, and a recorded graph of at least 300 nodes before and after the change. Record node and edge counts, fixture identity, browser version, hardware, and any throttling. For each run, record a trace while panning for 10 seconds, zooming across the 1.2 disclosure threshold for 10 seconds, and selecting nodes and tracing relationships for 10 seconds. Repeat each interaction three times and record frame time p95 and visible stalls for every run. Compare matching runs and investigate any regression rather than averaging away a stall.

For streaming, use the demo flow from spec 0013: chunks of 2 to 4 tokens at about 30 ms intervals, with the trace covering wheel zoom throughout the stream and its highlight commit. Record three runs and require p95 frame time at or below 16.7 ms for each, as specified there. The 60 FPS goal applies to the other interactions as well; record any missed target and do not mark OAC-6 complete until it is resolved.

### Build plan

Use the project's Tracer Bullet approach. Each slice works in both themes and is checked through the real workspace before expanding its coverage.

1. [ ] Capture a baseline for the representative large graph and inventory token and inline style consumers, including graph, editor, and shared controls. Record the graph, browser, machine, and interaction traces. **OAC-6, OAC-7**
2. [ ] Deliver one complete thread through both themes: central tokens, a shared control, a graph node and its selected state, and the editor surround. Check contrast, focus, theme switching, and the existing interaction path. **OAC-1, OAC-3, OAC-5, OAC-7**
3. [ ] Extend the system across workspace panels, shared primitives, dialogs, drawers, trace and status states, and small screens. Preserve actions, focus, and selection. **OAC-2, OAC-5, OAC-7**
4. [ ] Migrate remaining graph nodes, groups, edges, markers, minimap, controls, and background. Preserve relationship meaning, filtering, tracing, source links, pruning, and disclosure. **OAC-3, OAC-6, OAC-7**
5. [ ] Align Monaco themes and editor states with both workspace themes, retaining source navigation and font settings. **OAC-4, OAC-7**
6. [ ] Verify contrast on actual state pairs, keyboard and reduced motion behavior, both themes and narrow screens. Compare the same performance traces with the baseline, resolve regressions, and run the relevant tests, lint, typecheck, and build. Record results separately from the completed foundation verification. **OAC-1 through OAC-7**

### Consequences and follow up

The current component and state contracts remain familiar, and incremental slices limit the cost of rollback. The audit must include inline canvas and editor values, which a token change alone cannot reach. A calm palette also requires explicit non color signals for relationship direction and selection.

The existing `verify.md` records the completed foundation checks, not verification of this proposed overhaul. Add a separate dated overhaul verification record when the new criteria are checked. Reasoning and current evidence are in [rationale.md](rationale.md).

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
