# Verify: Walking skeleton loop · spec 0005 · updated 2026-09-02

_Steps derived from spec 0005 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual

- [x] Enter a valid public GitHub URL in the workspace header submission bar → progress banner displays sequential phases (validating, fetching tree, downloading files, parsing AST, completing layout) → AC-1, AC-2
- [x] Submit a malformed GitHub URL or non existent repository → inline alert displays friendly error message → AC-1, AC-9
- [x] Submit a public repository exceeding rate limits → structured notification displays rate limit countdown and offers inline GitHub token input → AC-3, AC-9
- [x] Inspect React Flow canvas after ingestion → nodes render in layered top to bottom hierarchy using Dagre layout positions without overlapping → AC-5, AC-6
- [x] Click a file node on the canvas → node highlights, right inspector panel switches to Code tab, and Monaco Editor displays the file source code → AC-6, AC-7, AC-8
- [x] Pan, zoom, and toggle minimap on canvas → graph controls respond smoothly and update viewport → AC-6
- [x] Trigger cancellation while repository ingestion is streaming → AbortController terminates pending requests and returns UI to idle state → AC-2
- [ ] Ingest repository containing TypeScript syntax errors → graph completes successfully with error flag visible on problematic file node → AC-4

## Commands

- [x] `npm run typecheck` → strict TypeScript checks pass across ingestion client, AST parser, Dagre layout utility, and Monaco viewer → AC-1, AC-4, AC-5, AC-7, AC-8
- [x] `npm run lint` → passes without lint errors across all newly created modules and components → AC-1, AC-8
- [x] `npm test` → Vitest suite passes all unit tests for GitHub URL parsing, AST import extraction, Dagre coordinate layout, and graph store state transitions → AC-1, AC-3, AC-4, AC-5, AC-8, AC-9
- [x] `npm run build` → Next.js production build succeeds with clean client code splitting for Monaco Editor and serverless route compilation → AC-2, AC-7

## Acceptance criteria coverage

- AC-1 public repository URL validation and parsing covered by `src/lib/github/` and URL unit tests
- AC-2 Server Sent Events ingestion pipeline covered by `src/app/api/ingest/route.ts` and SSE stream integration tests
- AC-3 defensive file collection and rate limit management covered by `src/lib/github/` client and mock API tests
- AC-4 in memory abstract syntax tree parsing covered by `src/lib/parser/` and ts-morph AST parser tests
- AC-5 client Dagre hierarchical layout computation covered by `src/graph/layout/` and layout utility tests
- AC-6 interactive React Flow canvas rendering covered by canvas store integration and custom node rendering
- AC-7 side by side Monaco Editor code inspection covered by `src/components/editor/` and dynamic editor mounting
- AC-8 dedicated graph client state store covered by `src/stores/graph-store.ts` and Zustand store unit tests
- AC-9 graceful error and rate limit recovery covered by error notification components and error simulation tests
