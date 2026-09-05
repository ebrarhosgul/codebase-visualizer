# Verify: Bidirectional graph and code deep linking, spec 0006 (updated 2026-09-04)

_Steps derived from spec 0006 acceptance criteria and value sourcing guarantees. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual

- [x] Click a file or symbol node on the React Flow canvas → right workspace panel switches to Code tab, loads target file, smoothly scrolls to declaration line, and shows a two second pulse highlight → AC-2, AC-8
- [x] Move cursor or select text across function declarations in Monaco Editor → React Flow camera smoothly pans and centers on matching symbol or file node without lagging → AC-3
- [x] Observe browser URL address bar while clicking nodes or moving editor cursor → query parameters (`repo`, `branch`, `file`, `line`, `symbol`) update accurately → AC-1
- [x] Rapidly click a canvas node and move editor cursor immediately within 200 milliseconds → dual guard time lock and coordinate match prevents camera and cursor feedback loop → AC-4
- [x] Open a shared deep link URL in a new browser tab with query parameters → repository ingests as normal, buffers navigation coordinates, and automatically jumps to target line and centers node upon parsing completion → AC-1, AC-7
- [x] Open a deep link URL pointing to a non existent file or symbol → UI falls back gracefully to repository overview, shows an informative toast alert, and cleans up invalid parameters → AC-6
- [x] Click the Share Link button in header or editor toolbar → full deep link URL copies to clipboard and confirmation notification displays → AC-8

## Value sourcing checks

- [x] Vary deep link file path across different repository subdirectories → verifies relative path extraction from `FileNode.path`
- [x] Vary active cursor position across nested functions and class methods → verifies innermost symbol identification from `SourceLocation.startLine` and `endLine`
- [x] Inspect React Flow camera zoom and pan coordinates when focusing nodes at canvas extremities → verifies node position calculation and viewport centering
- [x] Trigger fallback with malformed and unresolvable file queries → verifies toast notification string formatting and URL query cleanup

## Commands

- [x] `npm run typecheck` → strict TypeScript checks pass across AST parser symbol visitor, Zustand navigation actions, and Monaco decoration handlers → AC-1, AC-4, AC-5
- [x] `npm run lint` → passes with zero lint warnings across newly created hooks, components, and store slices → AC-1, AC-8
- [x] `npm test` → Vitest suite passes all unit tests for AST symbol extraction, query parameter serialization, and navigation store time lock logic → AC-1, AC-4, AC-5, AC-6
- [x] `npm run build` → Next.js production build succeeds with clean client code splitting for deep link hooks and Monaco editor bindings → AC-1, AC-7

## Acceptance criteria coverage

- AC-1 bidirectional URL synchronization covered by `src/hooks/use-deep-linking.ts` and Next.js router integration tests
- AC-2 canvas to editor navigation and line reveal covered by `src/components/editor/code-viewer.tsx` and Monaco decoration tests
- AC-3 editor to canvas reverse focus covered by `src/components/canvas/architecture-canvas.tsx` and camera centering tests
- AC-4 anti loop coordination covered by `src/stores/graph-store.ts` time lock unit tests
- AC-5 AST parser symbol declaration extraction covered by `src/lib/parser/ast-parser.ts` and ts-morph symbol unit tests
- AC-6 missing target graceful fallback covered by deep link URL parser and toast alert tests
- AC-7 deep link ingestion hydration covered by cold start buffering tests in `src/app/page.tsx`
- AC-8 share link quick action covered by clipboard utility and button component tests
