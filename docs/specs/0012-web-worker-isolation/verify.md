# Verify: Web Worker isolation for layout and parsing computations · spec 0012 · updated 2026-09-16

_Steps derived from spec 0012 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual

- [ ] Start dev server with `npm run dev` and load repository `facebook/react` or `zustand` → canvas renders hierarchical cards without freezing main UI thread → AC-1, AC-8
- [ ] Toggle architectural layers rapidly in canvas filter bar → existing canvas elements remain interactive and progress spinner displays in toolbar during computation → AC-3, AC-4
- [ ] Enter multiple search query tokens rapidly in succession → previous pending requests are superseded immediately without queued lag → AC-3
- [ ] Inspect console or simulate 5000ms delay in worker → client terminates worker, logs warning, and surfaces graceful alert banner without locking main thread → AC-6

## Commands

- [ ] `npm test src/lib/workers/__tests__/worker-types.test.ts` → validates typed message envelopes and type guards → AC-7
- [ ] `npm test src/graph/layout/__tests__/layout-worker-client.test.ts` → validates busy worker termination, 5000ms timeout guard, and synchronous test fallback → AC-3, AC-5, AC-6
- [ ] `npm test src/hooks/__tests__/use-async-graph-layout.test.ts` → validates 50ms debouncing, unmount safety, and background state coordination → AC-3, AC-4
- [ ] `npm test src/components/canvas/__tests__/graph-controls-toolbar.test.tsx` → validates layout calculation spinner rendering → AC-4
- [ ] `npm test src/components/canvas/__tests__/architecture-canvas.test.tsx` → validates canvas integration and element persistence during calculation → AC-4, AC-5
- [ ] `npm run typecheck` → confirms zero TypeScript errors across all worker and canvas modules → AC-1 through AC-8
- [ ] `npm run lint` → confirms zero ESLint errors or warnings → AC-7
- [ ] `npm run build` → confirms Next.js production worker chunk bundling and static generation succeed → AC-1

## Acceptance-criteria coverage

- AC-1: Dagre layout in Web Worker covered by `npm run build`, `npm test src/graph/layout/__tests__/layout-worker-client.test.ts`, and manual UI check
- AC-2: Filtering and element adaptation in worker pipeline covered by `npm test src/graph/layout/__tests__/layout-worker-client.test.ts`
- AC-3: Monotonic request tracking and busy worker termination covered by `npm test src/graph/layout/__tests__/layout-worker-client.test.ts` and rapid filter toggle check
- AC-4: Non-blanking canvas and toolbar indicator covered by `npm test src/components/canvas/__tests__/graph-controls-toolbar.test.tsx` and manual UI inspection
- AC-5: Synchronous fallback in test environments covered by `npm test src/hooks/__tests__/use-async-graph-layout.test.ts` and full vitest suite
- AC-6: 5000ms timeout guard and error banner covered by `npm test src/graph/layout/__tests__/layout-worker-client.test.ts`
- AC-7: Reusable worker contracts covered by `npm test src/lib/workers/__tests__/worker-types.test.ts`
- AC-8: Frame rate and performance on 300+ node graphs covered by manual Chrome DevTools inspection
