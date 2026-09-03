# Verify: Design system and UI foundation · spec 0004 · updated 2026-09-02

_Steps derived from spec 0004 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual

- [x] Inspect page in browser → dark theme renders by default without white flash on reload → AC-1
- [x] Inspect surface and text contrast in DevTools → text contrast exceeds 4.5 to 1, borders exceed 3 to 1 → AC-1, AC-4
- [x] Drag split pane separators between explorer, canvas, and inspector → panels resize smoothly and maintain minimum bounds → AC-2
- [x] Collapse left explorer panel → panel folds away, expand button appears, keyboard focus transfers to expand toggle → AC-2, AC-3
- [x] Collapse right inspector panel → panel folds away, expand button appears, keyboard focus transfers to expand toggle → AC-2, AC-3
- [x] Reload browser after resizing or collapsing panels → dimensions and collapse states restore from local storage → AC-2, AC-7
- [x] Tab through interactive controls using keyboard → focus rings appear with 2px offset on buttons, inputs, tabs, and drag handles → AC-3
- [x] Navigate split pane drag handles with arrow keys → panel size adjusts predictably by keyboard → AC-3
- [x] Resize viewport width below 860px → layout switches to uncompressed canvas with overlay slide over drawers for files and inspector → AC-9
- [x] Open overlay drawers on narrow screen and press Escape key → drawer closes safely and returns focus → AC-3, AC-9
- [x] Inspect React Flow node cards → dark slate background, syntax colored file type badges, and collapsible detail rows render correctly → AC-5
- [x] Click zoom in, zoom out, fit view, and minimap toggle buttons on canvas controls toolbar → canvas responds with correct zoom actions → AC-5
- [x] Switch tabs in right inspector panel between Code, Inspector, and Trace → corresponding tab panels display smoothly → AC-6

## Commands

- [x] `npm run typecheck` → passes with strict TypeScript validation across layout components, store, and primitives → AC-2, AC-6, AC-7
- [x] `npm run lint` → passes without lint errors across all component and layout files → AC-1, AC-6
- [x] `npm test` → Vitest suite passes all 68 unit and component tests for layout store, split pane resizing, responsive breakpoints, and base UI primitives → AC-1, AC-2, AC-3, AC-5, AC-6, AC-7, AC-9
- [x] `npm run build` → Next.js production build succeeds with clean stylesheet bundling → AC-1, AC-4, AC-8

## Acceptance criteria coverage

- AC-1 dark mode color tokens covered by `src/app/globals.css`, inline head script, and contrast checks
- AC-2 resizable split pane layout covered by `src/components/layout/` and workspace layout tests
- AC-3 keyboard and accessibility compliance covered by focus rings, ARIA roles, and component unit tests
- AC-4 developer typography scale covered by Geist Sans and Geist Mono in `src/app/globals.css`
- AC-5 React Flow theme and custom nodes covered by `src/components/canvas/` and canvas rendering tests
- AC-6 base component foundation covered by `src/components/ui/` and primitive unit tests
- AC-7 workspace layout state store covered by `src/stores/workspace-store.ts` and store persistence tests
- AC-8 living design token documentation covered by `docs/design.md`
- AC-9 responsive small screen fallback covered by `src/components/layout/` and responsive breakpoint tests
