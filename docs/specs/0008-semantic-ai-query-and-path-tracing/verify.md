# Verify: Semantic AI query and path tracing, spec 0008 (created 2026-09-05)

_Steps derived from spec 0008 acceptance criteria and value sourcing guarantees. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual

- [x] Select the Trace tab in the right workspace panel → panel mounts with query input, demo mode pill, and suggested questions → AC-1, AC-2
- [x] Submit a question in demo mode without configuring an API key → pre generated answer streams into conversation view and corresponding dependency path lights up on the canvas → AC-1, AC-2, AC-5
- [x] Open provider settings dialog, configure an API key, and select Gemini Flash → key stores in encrypted HTTP only cookie and custom mode activates → AC-3
- [x] Submit a natural language question asking how module A connects to module B → response provides architectural context and highlights the verified multi edge path on the React Flow canvas with glowing accent styling → AC-1, AC-4, AC-5
- [x] Click an interactive citation chip embedded in the assistant response → canvas centers on the referenced node and Monaco editor scrolls to the exact symbol declaration line → AC-6
- [x] Submit a query asking for a connection between two completely independent modules with no shared path → system returns a graceful explanation of architectural separation, highlights both isolated nodes, and suggests the closest common folder ancestor → AC-7
- [x] Click the stop generation button during an active streaming query → stream aborts immediately, store returns to idle state, and partial text remains readable in the thread → AC-1

## Value sourcing checks

- [x] Inspect context payload sent to model → verifies condensed graph summary includes exported symbol signatures, layer classifications, and fan in or fan out metrics
- [x] Verify path trace edge identifiers against canvas elements → verifies all edge IDs in `activeTrace.stepEdgeIds` exist in `CodebaseGraph.edges`
- [x] Verify citation coordinates → confirms line numbers and file paths accurately resolve to loaded file nodes and symbol ranges
- [x] Test encrypted cookie lifecycle → confirms `/api/ai/keys` sets HTTP only cookie with AES 256 GCM encryption and `/api/ai/keys` DELETE removes it

## Commands

- [x] `npm run typecheck` → strict TypeScript checks pass across AIProvider interface, SSE streaming route handlers, and Zustand active trace slice → AC-1, AC-3, AC-4
- [x] `npm run lint` → passes with zero lint warnings across all new components, hooks, and services → AC-1, AC-8
- [x] `npm test` → Vitest suite passes all unit tests for path validation helper, context compressor, and demo mock provider → AC-2, AC-4, AC-7
- [x] `npm run build` → Next.js production build succeeds with clean server streaming routes and client UI bundles → AC-1, AC-3

## Acceptance criteria coverage

- AC-1 query submission and streaming covered by `src/components/trace/trace-panel.tsx` and `src/app/api/ai/query/route.ts`
- AC-2 zero cost demo mode covered by `src/lib/ai/demo-provider.ts`
- AC-3 provider agnostic BYOK and cookie security covered by `src/lib/ai/types.ts`, `src/lib/ai/crypto.ts`, and `src/app/api/ai/keys/route.ts`
- AC-4 deterministic graph path validation covered by `src/graph/path-validation.ts` and `src/graph/path-trace.ts`
- AC-5 visual canvas path highlight covered by `src/components/canvas/architecture-canvas.tsx` and `src/stores/graph-store.ts`
- AC-6 interactive citation deep linking covered by `src/components/trace/trace-panel.tsx` and `src/stores/graph-store.ts`
- AC-7 graceful disconnection explanation covered by `src/graph/path-validation.ts`
