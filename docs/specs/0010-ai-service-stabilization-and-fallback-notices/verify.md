# Verify: AI service stabilization and fallback notices, spec 0010 (created 2026-09-09)

_Steps derived from spec 0010 acceptance criteria and value sourcing guarantees. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual

- [ ] Submit an AI query exceeding the 30 req/min rate limit in BYOK mode → FallbackNoticeCard mounts displaying live countdown timer and immediate Switch to Demo Mode button → AC-1, AC-2, AC-3
- [ ] In the rate limit notice card, check auto retry and wait for countdown to reach zero → query automatically re submits without manual intervention → AC-3
- [ ] In the rate limit notice card, click the Switch to Demo Mode button → provider switches to demo, active connection aborts, and query resolves immediately using local fixtures → AC-3, AC-5
- [ ] Submit a BYOK query with an invalid or expired API key → FallbackNoticeCard mounts with key error explanation and an Open Key Settings button → AC-1, AC-2, AC-3
- [ ] Click the Open Key Settings button on the fallback notice card → KeySettingsDialog opens directly, allowing user to paste a new valid key or clear credentials → AC-3
- [ ] Simulate upstream provider outage (503 response) halfway through answer generation → partial text generated up to the failure remains visible, followed by FallbackNoticeCard offering Switch to Demo Mode → AC-1, AC-2, AC-4
- [ ] Trigger an error containing a mock raw API key in upstream response → verify error notice displays sanitized message with key completely redacted → AC-4
- [ ] Toggle browser offline status via DevTools network tab → submit query in Demo mode → answers and visual BFS dependency path traces generate successfully with zero network errors → AC-5
- [ ] Toggle browser offline status during an active BYOK query → network failure triggers immediate fallback card with single click Switch to Demo Mode recovery → AC-1, AC-2, AC-5

## Value sourcing checks

- [ ] Inspect `/api/ai/query` response on rate limit → response body is structured JSON with `code: "rate_limit"`, `suggestedAction: "switch_demo"`, and numeric `retryAfterSeconds`
- [ ] Inspect SSE stream error chunk on mid stream failure → payload is typed JSON containing `type: "error"`, sanitized `error` message, and `fallbackNotice` metadata
- [ ] Inspect browser sessionStorage under `cv:thread:{repoFullName}` → verifies `fallbackNotice` entity is persisted inside message object and rehydrates after page refresh
- [ ] Inspect upstream provider error logs → confirms regex filter in `sanitizeErrorMessage` removes strings matching API key and Bearer token formats before client delivery

## Commands

- [ ] `npm run typecheck` → strict TypeScript checks pass across extended AI types, error classifier module, stream hook, and fallback components → AC-1, AC-4
- [ ] `npm run lint` → passes with zero lint warnings across all new components, routes, and utilities → AC-1, AC-2
- [ ] `npm test` → Vitest suite passes all unit and integration tests for error classification, credential redaction, stream error parsing, and fallback notice UI → AC-1, AC-2, AC-3, AC-4, AC-5
- [ ] `npm run build` → Next.js production build succeeds with clean server routes and client bundles → AC-1, AC-5

## Acceptance criteria coverage

- AC-1 failure categorization & structured payload covered by `src/lib/ai/error-classifier.ts` and `src/app/api/ai/query/route.ts`
- AC-2 interactive FallbackNoticeCard component covered by `src/components/trace/fallback-notice-card.tsx` and `src/components/trace/trace-panel.tsx`
- AC-3 one click recovery triggers covered by `src/components/trace/fallback-notice-card.tsx` and `src/components/trace/trace-panel.tsx`
- AC-4 server side credential redaction covered by `src/lib/ai/error-classifier.ts` and `src/lib/ai/gemini-provider.ts`
- AC-5 offline resilience & zero network demo covered by `src/lib/ai/demo-provider.ts` and `src/components/trace/trace-panel.tsx`
