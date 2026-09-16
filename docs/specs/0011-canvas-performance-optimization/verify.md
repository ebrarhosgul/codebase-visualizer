# Verify: Canvas performance optimization · spec 0011 · updated 2026-09-16

_Steps derived from spec 0011 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual

- [x] Load a multi file repository on the canvas → verify offscreen nodes are skipped from DOM rendering via onlyRenderVisibleElements → AC-1
- [x] Hover cursor over multiple nodes in rapid succession → verify only the hovered node card re renders without canvas level flicker or re renders → AC-2
- [x] View canvas at default zoom (1.0) → verify symbol nodes remain hidden → AC-3
- [x] Zoom camera past 1.2 threshold → verify symbol nodes become visible within parent folder containers → AC-3
- [x] Rapidly wheel or pinch zoom in and out across the 1.2 threshold → verify visibility toggles smoothly with throttle without dropping frames or UI stuttering → AC-4

## Commands

- [x] `npm test` → all unit and integration test suites pass cleanly including AC-1 to AC-4 tests → AC-1, AC-2, AC-3, AC-4
- [x] `npm run lint` → passes with zero errors and zero warnings → AC-2
- [x] `npm run typecheck` → passes with zero type errors → AC-1, AC-2, AC-3, AC-4
- [x] `npm run build` → production build compiles successfully in under 3 seconds → AC-1, AC-2, AC-3, AC-4

## Acceptance-criteria coverage

- AC-1 (Viewport pruning) covered by UI step 1 and test command
- AC-2 (Decoupled hover state) covered by UI step 2 and test command
- AC-3 (Symbol progressive disclosure at zoom 1.2) covered by UI steps 3 and 4, and test command
- AC-4 (Smooth rapid zoom throttling) covered by UI step 5 and test command
