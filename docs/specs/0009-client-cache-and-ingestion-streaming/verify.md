# Verify: Client cache and ingestion streaming, spec 0009 (created 2026-09-07)

_Steps derived from spec 0009 acceptance criteria and value sourcing guarantees. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual

- [x] Ingest a repository for the first time → watch progress bar display phase transitions and granular file counters (`Unpacking file X`, `Parsing TypeScript AST module X of Y`) → AC-4
- [x] Refresh the page and re submit the identical repository URL → upstream commit hash is verified, `cache_hit` event is emitted, and canvas renders graph in under 100 milliseconds without downloading archive bytes → AC-1, AC-2
- [x] Click the Force Re ingest button in the submission bar → pipeline bypasses local cache, re downloads the archive, re parses the AST, and updates IndexedDB record with fresh timestamps → AC-3
- [x] Simulate GitHub rate limit response (HTTP 403 or 429) → Rate Limit Recovery modal mounts displaying live countdown timer, permission explanation, and token input field → AC-6
- [x] Enter a valid personal access token in the modal dialog → token is submitted to `/api/auth/github-token`, saved to encrypted httpOnly cookie, modal dismisses, and ingestion restarts automatically → AC-5, AC-6
- [x] Verify token management in header → Key button shows Token set indicator, clicking allows updating or clearing token via DELETE request → AC-5
- [x] Ingest more than 10 repositories or fill 300 megabytes of cache → least recently used eviction automatically deletes the oldest accessed repository record from IndexedDB → AC-7
- [x] Disconnect network or trigger offline mode → submitting a cached repository URL detects network failure and automatically falls back to IndexedDB record with offline notice banner → AC-8
- [x] Manually modify cached record schemaVersion to 999 in developer tools → submitting repository silently purges the corrupted record and falls back to clean fresh ingestion without UI crashes → AC-9

## Value sourcing checks

- [x] Inspect IndexedDB storage in browser DevTools → verifies `codebase_visualizer_cache_v1` database contains `repositories` store with indexes on `lastAccessedAt`, `repoKey`, and `commitSha`
- [x] Inspect `/api/ingest` network stream on cache hit → verifies response emits `cache_hit` SSE event and closes stream with zero tarball download
- [x] Inspect cookies in network tab → verifies `github_pat` is marked `httpOnly`, `secure`, `sameSite: lax`, and contains encrypted ciphertext with no plain text token visible
- [x] Inspect SSE progress event payload → verifies `detail` object contains numeric `currentItem` and optional `totalItems` alongside string `currentItemName`
- [x] Verify server throttle → confirms progress events arrive at intervals of at least 100 milliseconds, preventing client event flooding

## Commands

- [x] `npm run typecheck` → strict TypeScript checks pass across IndexedDB storage helper, auth token route, and extended ingestion progress types → AC-1, AC-4, AC-5
- [x] `npm run lint` → passes with zero lint warnings across all new components, routes, and utilities → AC-1, AC-6
- [x] `npm test` → Vitest suite passes all unit tests for IndexedDB storage service, LRU eviction logic, and token validation utilities → AC-1, AC-5, AC-7, AC-9
- [x] `npm run build` → Next.js production build succeeds with clean server routes and client bundles → AC-1, AC-5

## Acceptance criteria coverage

- AC-1 client cache hydration covered by `src/lib/storage/indexed-db.ts` and `src/stores/graph-store.ts`
- AC-2 cache freshness validation covered by `src/app/api/ingest/route.ts` and `src/lib/github/client.ts`
- AC-3 force re ingest bypass covered by `src/components/workspace/repo-submission-bar.tsx` and `src/stores/graph-store.ts`
- AC-4 granular two tier streaming covered by `src/app/api/ingest/route.ts`, `src/lib/parser/tar-extractor.ts`, and `src/lib/parser/ast-parser.ts`
- AC-5 encrypted httpOnly cookie token storage covered by `src/app/api/auth/github-token/route.ts` and `src/lib/github/client.ts`
- AC-6 rate limit recovery modal covered by `src/components/workspace/rate-limit-dialog.tsx` and `src/stores/graph-store.ts`
- AC-7 least recently used cache eviction covered by `src/lib/storage/indexed-db.ts`
- AC-8 graceful offline fallback covered by `src/stores/graph-store.ts` and `src/components/workspace/repo-submission-bar.tsx`
- AC-9 silent invalidation on schema corruption covered by `src/lib/storage/indexed-db.ts` and `src/entities/serialization.ts`
