# Review, feat/zero-friction-demo-mode-spec, 2026-09-19

**Reviewed by**: Gemini 2.5 Pro (author on Claude Sonnet)
**Scope**: 40 files, branch vs main (5c07f5460fefd4e0bc5165b2fe8194d851648975)
**Verdict**: Approve with nits

## Summary
This change implements zero-friction demo mode (Spec 0013), delivering repository-specific heuristic answers, span-aware token chunking, canvas node highlighting, and filter recovery computed entirely in the browser at zero network cost. Previous review findings regarding in-flight message finalization on stop, updater side-effects, and animation frame cleanup on unmount/abort have been cleanly resolved and validated with dedicated test coverage. The codebase adheres strictly to immutability and performance constraints with exhaustive tests across all acceptance criteria.

## Nits
- ⚪ `src/lib/ai/demo/builders/overview.ts:36`: Inlines raw codepoint comparison (`pathA < pathB ? -1 : pathA > pathB ? 1 : 0`) instead of reusing the `compareCodepoints` helper used in `central-files.ts`, `layer-breakdown.ts`, `state-flow.ts`, and `heuristic-index.ts`.
- ⚪ `src/lib/ai/demo/router.ts:8`: Spec AC-9 mentions `api` requiring word boundaries alongside `state`, `path`, `hub`, and `flow`, but `api` was omitted from `router.ts` triggers (following the router table in the spec). If `api` was intended to route to `layer_breakdown` or `central_files`, add `\bapi\b`; otherwise, keep as-is if overview fallback is intended.

## Strengths
- **Zero-cost, offline graph heuristics engine**: Pure client-side AST and topological analysis (`heuristic-index.ts`) completely decoupled from network transport, executing in <5ms with zero provider bills.
- **Deterministic and immutable data modeling**: Strict tie-breaking (fan-in desc -> fan-out desc -> raw codepoints asc) and frozen records guarantee deterministic, reproducible outputs across runs and ingests.
- **Robust lifecycle and interrupt handling**: In-flight stream interruption, repository switching, and user stop actions cleanly finalize assistant messages, cancel pending animation frames, and persist valid thread state without hanging streaming indicators.
- **Span-aware streaming tokenization**: Token cycle chunker preserves bold (`**...**`) and inline code (`` `...` ``) integrity so markdown elements are never split mid-syntax, coupled with rAF coalescing for smooth 60 FPS canvas zoom performance.
- **Exhaustive test suite**: 679 tests across 62 files passing cleanly, thoroughly verifying all 13 acceptance criteria, degenerate graph fallbacks, canvas highlight isolation, and filter recovery actions.

## Test coverage
- All 13 Acceptance Criteria from Spec 0013 are backed by comprehensive unit, hook, and component tests.
- `architecture-canvas.test.tsx` thoroughly verifies answer highlight isolation (AC-6), untouched edge styling, and `visibleFileIds` publishing (AC-7).
- `trace-panel-streaming.test.tsx` and `trace-panel.test.tsx` rigorously test rAF coalescing (AC-5), prompt chips (AC-1, AC-11), hidden filter notices and "Show all" recovery (AC-7), repository switch finalization, and explicit stop button finalization (AC-12).
- `heuristic-index.test.ts` and `builders.test.ts` test single-pass index construction, layer matrix aggregation, inverted edge sorting, store importer hierarchy, and honest fallbacks on edgeless graphs (AC-2, AC-3, AC-4, AC-10, AC-13).
- `use-ai-query-stream.test.ts` confirms unconditional local execution in demo mode, zero network requests, and exactly one `onComplete` notification per stream.
