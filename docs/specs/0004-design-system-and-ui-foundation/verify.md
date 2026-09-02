# Verify: Design system and UI foundation · spec 0004 · updated 2026-09-02

_Steps derived from spec 0004 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## Commands

- [ ] `npm run typecheck` → passes with strict TypeScript validation across layout components, store, and primitives → AC-2, AC-6, AC-7
- [ ] `npm run lint` → passes without lint errors across all component and layout files → AC-1, AC-6
- [ ] `npm test` → Vitest suite passes all unit and component tests for layout store, split pane resizing, responsive breakpoints, and base UI primitives → AC-1, AC-2, AC-3, AC-5, AC-6, AC-7, AC-9
- [ ] `npm run build` → Next.js production build succeeds with clean stylesheet bundling → AC-1, AC-4, AC-8

## Verification checklist

- [ ] Dark mode first color tokens defined in `src/app/globals.css` provide high contrast ratios meeting WCAG AA standards → AC-1
- [ ] Three pane resizable layout allows dragging pane boundaries, enforcing minimum width limits, and collapsing sidebars → AC-2
- [ ] Split pane handles, buttons, tabs, dialogs, and dropdown menus support keyboard navigation with visible focus rings → AC-3
- [ ] Typography scale pairs Geist Sans and Geist Mono with uniform line heights for compact developer interfaces → AC-4
- [ ] React Flow canvas theme customizes node cards with syntax colored badges, minimap styling, and controls bar → AC-5
- [ ] Base user interface primitives (Button, IconButton, Badge, Input, Tooltip, Dialog, Tabs, DropdownMenu) render predictably → AC-6
- [ ] Zustand layout store saves panel dimensions to browser `localStorage` and restores them safely without hydration mismatch → AC-7
- [ ] Canonical design specification in `docs/design.md` documents tokens, spacing scales, and accessibility conventions → AC-8
- [ ] Viewports narrower than 860px adaptively transition side panels to slide over overlay drawers → AC-9

## Acceptance criteria coverage

- AC-1 dark mode color tokens covered by `src/app/globals.css` and token contrast verification tests
- AC-2 resizable split pane layout covered by `src/components/layout/` and workspace layout tests
- AC-3 keyboard and accessibility compliance covered by component accessibility unit tests
- AC-4 developer typography scale covered by `src/app/globals.css` and layout styling
- AC-5 React Flow theme and custom nodes covered by `src/components/canvas/` and canvas rendering tests
- AC-6 base component foundation covered by `src/components/ui/` and primitive unit tests
- AC-7 workspace layout state store covered by `src/stores/workspace-store.ts` and store persistence tests
- AC-8 living design token documentation covered by `docs/design.md`
- AC-9 responsive small screen fallback covered by `src/components/layout/` and responsive breakpoint tests
