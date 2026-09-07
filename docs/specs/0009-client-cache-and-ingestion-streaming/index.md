# 0009. Client Cache and Ingestion Streaming

**Date**: 2026-09-07
**Status**: In Progress

## Summary

This specification establishes client storage persistence and enhanced ingestion streaming for repository graphs. Previously parsed repositories persist in browser IndexedDB storage, loading instantly on repeat visits without redundant network downloads or abstract syntax tree re parsing. On submission, the ingestion pipeline checks upstream commit hashes to serve fresh cached graphs or stream granular progress updates with file counters. GitHub personal access tokens migrate to encrypted httpOnly cookies matching the existing AI credential architecture, while unexpected rate limits trigger a countdown dialog with auto resume.

## Context

Reasoning and options: see [rationale.md](rationale.md).

## Requirements

**User stories**:
- As a developer exploring open source repositories, I want previously analyzed codebases to open immediately so that I do not waste time or network bandwidth waiting for repeat downloads.
- As a user analyzing a large repository, I want to see real time progress showing both current phase and processed file counts so that I understand extraction speed and remaining work.
- As an engineer hitting GitHub public rate limits, I want clear explanations, a live countdown, and a secure way to supply a personal access token so that I can resume exploration without losing context.

**Acceptance criteria**:
- **AC-1**: Previously analyzed repositories load instantly from client IndexedDB storage (`codebase_visualizer_cache_v1`) without waiting for network archive downloads or abstract syntax tree re parsing when the cached commit hash matches upstream.
- **AC-2**: On repository submission, `/api/ingest` verifies the upstream branch head commit hash via GitHub API `GET /repos/{owner}/{repo}/commits/{branch}` against client `cachedCommitSha`; if identical, the stream emits a `cache_hit` event with the confirmed hash and closes immediately, instructing the client to hydrate from IndexedDB.
- **AC-3**: Users can bypass client cache and force a fresh fetch and parse by clicking a Force Re ingest action in the user interface, which dispatches `/api/ingest` with `forceFresh: true` and overwrites the existing IndexedDB record upon completion.
- **AC-4**: The ingestion stream emits real time progress events with both stage transitions (`validating`, `downloading_archive`, `unpacking_files`, `parsing_ast`, `complete`) and item details (`currentItem`, optional `totalItems` during AST parsing, `currentItemName`), throttled on the server to at most once per 100 milliseconds to avoid stream saturation and React re render overhead.
- **AC-5**: GitHub personal access tokens are transmitted to a secure route `/api/auth/github-token` and stored in an encrypted httpOnly cookie (`github_pat`) with AES 256 GCM encryption, ensuring parity with AI provider key storage while keeping tokens inaccessible to client scripts. Legacy `sessionStorage` tokens are automatically migrated on startup.
- **AC-6**: When GitHub returns HTTP 403 or 429 rate limit responses, the client presents an accessible modal dialog showing a live countdown until the reset time, explanatory text regarding read only token permissions, an inline token entry input with prefix validation (`ghp_` or `github_pat_`), and an automatic retry that restarts the failed ingestion upon submission.
- **AC-7**: The IndexedDB repository store enforces a maximum of 10 cached repositories or 300 megabytes of total stored data, automatically pruning the least recently accessed entries (`lastAccessedAt` index) within an atomic readwrite transaction before storing newly completed graphs.
- **AC-8**: If network connectivity is lost or GitHub API is unreachable during the freshness check, the client automatically falls back to the locally cached graph record in IndexedDB, displaying an offline notice banner with the last synced timestamp.
- **AC-9**: If a cached record fails canonical schema validation (`CURRENT_SCHEMA_VERSION = 1`) or contains corrupted JSON data upon retrieval, the client silently evicts the invalid record and proceeds with full pipeline ingestion without disrupting the user interface.

## Decision

**Chosen option**: Option 3: Client IndexedDB persistence with commit hash validation, encrypted httpOnly cookie token storage, and throttled server sent events streaming.

We build a lightweight native IndexedDB wrapper (`codebase_visualizer_cache_v1`) with zero new npm dependencies, persisting parsed `CodebaseGraph` payloads and source maps alongside commit hashes and access timestamps. Upstream commit validation executes within `/api/ingest` via a quick commit metadata query, emitting an immediate `cache_hit` event when the local cache is current. Granular file progress streams with a 100 millisecond server throttle, while GitHub personal access tokens are stored in an encrypted httpOnly cookie matching the application standard.

**Implementation skills**: modern-web-guidance (~/.gemini/config/plugins/modern-web-guidance-plugin/skills/modern-web-guidance/)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**:

IndexedDB Database: `codebase_visualizer_cache_v1`
Object Store: `repositories`

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | Yes | Primary key formatted as `${owner}/${repo}:${branch}` |
| `repoKey` | `string` | Yes | Repository identifier formatted as `${owner}/${repo}` |
| `owner` | `string` | Yes | Repository owner name |
| `repo` | `string` | Yes | Repository name |
| `branch` | `string` | Yes | Selected branch name |
| `commitSha` | `string` | Yes | Full 40 character git commit SHA |
| `schemaVersion` | `number` | Yes | Canonical graph schema version (must equal 1) |
| `graph` | `CodebaseGraph` | Yes | Full canonical graph containing nodes, edges, and clusters |
| `fileSources` | `Record<string, string>` | Yes | Source file path to raw text contents map |
| `nodeCount` | `number` | Yes | Total graph nodes count for quick display |
| `edgeCount` | `number` | Yes | Total dependency edges count |
| `fileCount` | `number` | Yes | Total parsed files count |
| `byteSize` | `number` | Yes | Record size in bytes, computed via `new Blob([JSON.stringify({ graph, fileSources })]).size` |
| `createdAt` | `number` | Yes | Creation timestamp in epoch milliseconds |
| `lastAccessedAt` | `number` | Yes | Last accessed timestamp in epoch milliseconds |

Indexes:
- `by_last_accessed`: keyPath `lastAccessedAt`, unique `false` (drives least recently used pruning)
- `by_repo`: keyPath `repoKey`, unique `false` (supports repository lookup across branches)
- `by_commit`: keyPath `commitSha`, unique `false` (supports commit hash verification)

**State transitions**:

Repository Ingestion and Cache Lifecycle:
```
[User submits URL]
        │
        ▼
[Check local IndexedDB] ──(not found)─────────────────────────┐
        │                                                     │
     (found)                                                  │
        │                                                     │
        ▼                                                     ▼
[POST /api/ingest with cachedCommitSha]             [POST /api/ingest (cold)]
        │                                                     │
  ┌─────┴─────────────────────┐                               │
  │                           │                               │
(upstream SHA matches)   (SHA differs / fresh)                │
  │                           │                               │
  ▼                           ▼                               ▼
[Emit cache_hit SSE]    [Stream validating]             [Stream validating]
  │                           │                               │
  ▼                           ▼                               ▼
[Hydrate from IDB]      [Stream downloading_archive]    [Stream downloading_archive]
  │                           │                               │
  ▼                           ▼                               ▼
[Canvas active]         [Stream unpacking_files]        [Stream unpacking_files]
                              │                               │
                              ▼                               ▼
                        [Stream parsing_ast]            [Stream parsing_ast]
                              │                               │
                              ▼                               ▼
                        [Emit complete SSE]             [Emit complete SSE]
                              │                               │
                              ▼                               ▼
                        [Save to IndexedDB]             [Save to IndexedDB]
                              │                               │
                              ▼                               ▼
                        [Canvas active]                 [Canvas active]
```

Rate Limit Recovery State Machine:
```
[HTTP 403 / 429 response] ──► [Set rateLimitState in Zustand]
                                      │
                                      ▼
                             [Display Modal Dialog]
                             (Shows countdown timer)
                                      │
                         ┌────────────┴────────────┐
                         ▼                         ▼
                  [Timer expires]           [User enters token]
                         │                         │
                         ▼                         ▼
                  [Enable retry]           [POST /api/auth/github-token]
                                                   │
                                                   ▼
                                           [Set httpOnly cookie]
                                                   │
                                                   ▼
                                           [Dismiss modal]
                                                   │
                                                   ▼
                                           [Auto retry ingestion]
```

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/api/ingest` | POST | `repositoryUrl`: string (req)<br>`branch`: string (opt)<br>`cachedCommitSha`: string (opt)<br>`forceFresh`: boolean (opt) | SSE event stream (`text/event-stream`) | None or encrypted cookie | 400 invalid URL<br>403/429 rate limit<br>404 repo missing<br>500 internal error |
| `/api/auth/github-token` | POST | `token`: string (req) | `{ success: true, maskedToken: string }` | None | 400 invalid format (must match `ghp_` or `github_pat_`) |
| `/api/auth/github-token` | GET | None | `{ hasToken: boolean, maskedToken: string \| null }` | Cookie | None |
| `/api/auth/github-token` | DELETE | None | `{ success: true }` | Cookie | None |

Client `fetch` invocations calling `/api/ingest` include `credentials: 'include'` to supply the encrypted `github_pat` cookie automatically.

Server Sent Events protocol payloads on `/api/ingest`:
- `cache_hit`: `{ phase: 'complete', cached: true, commitSha: string, message: string }`
- `progress`: `{ phase: IngestionPhase, progress: number, message: string, detail?: IngestProgressDetail }`
- `complete`: `{ phase: 'complete', repository: RepoMetadata, graph: CodebaseGraph, fileSources: Record<string, string>, commitSha: string, fileCount: number, nodeCount: number }`
- `error`: `{ phase: 'error', error: IngestError }`

`IngestProgressDetail` shape:
- `currentItem`: number (current file being unpacked or parsed)
- `totalItems`: optional number (total files to parse, supplied during `parsing_ast`)
- `currentItemName`: optional string (relative path of current file being parsed)

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Fast repository load | Cached `CodebaseGraph` and source text | Client IndexedDB record (`graph`, `fileSources`) |
| Freshness validation | Cache hit decision | Upstream commit SHA from `GET /repos/{owner}/{repo}/commits/{branch}` compared with client `cachedCommitSha` |
| Progress item counter | Current processed file count | Loop counter in `tar-extractor.ts` and `ast-parser.ts` |
| Progress total items | Total files count | Source files array length in memory during `parsing_ast` |
| Progress module name | Current file name in progress text | Active file path during TypeScript AST parsing loop |
| Rate limit countdown | Remaining seconds until reset | `x-ratelimit-reset` header from GitHub API, passed in `rateLimitReset` |
| Rate limit token entry | GitHub Personal Access Token | User input in modal dialog, persisted to encrypted httpOnly cookie |
| Token presence indicator | Header Key button status | `GET /api/auth/github-token` returning `hasToken: boolean` |
| Legacy token migration | Token in encrypted cookie | `sessionStorage.getItem('github_pat')` transferred on app boot and deleted |
| Record byte calculation | `byteSize` in IndexedDB | Computed via `new Blob([JSON.stringify({ graph, fileSources })]).size` |
| Offline fallback | Offline status alert and timestamp | Local IndexedDB record `lastAccessedAt` combined with `navigator.onLine` |

**Key invariants**:
- Every record stored in IndexedDB must pass canonical schema validation (`schemaVersion === 1`).
- The total number of cached repositories in IndexedDB must never exceed 10 records.
- Total stored cache volume must not exceed 300 megabytes; records exceeding quota are pruned by least recently used access order inside an atomic transaction.
- GitHub personal access tokens must never be written to browser localStorage, sessionStorage, or unmasked client state.
- Server sent event progress updates must never exceed 10 events per second (minimum 100 millisecond interval between detailed progress events).
- If upstream commit SHA matches client `cachedCommitSha` and `forceFresh` is false, zero archive bytes may be downloaded from GitHub.

**Security model**:
- GitHub Personal Access Tokens are stored strictly in an encrypted httpOnly cookie (`github_pat`) encrypted with AES 256 GCM using the existing encryption utility.
- Token format is validated on the server before cookie creation, requiring either the classic `ghp_` prefix or fine grained `github_pat_` prefix.
- All GitHub requests use read only endpoints; no repository write or administrative privileges are requested or used.
- Ingestion pipeline limits are enforced on untrusted archives: maximum 200 source files, maximum 2 megabytes per individual file, and 50 megabytes maximum uncompressed total.

**Configuration required**:
- `COOKIE_ENCRYPTION_KEY`: 32 byte secret used for AES 256 GCM cookie encryption (reuses existing application secret from spec 0008).

**Critical test scenarios**:
- Happy path: Submitting a cached repository URL verifies matching commit SHA, receives `cache_hit` event, and hydrates canvas in under 100 milliseconds without network archive download, verifies **AC-1**, **AC-2**.
- Streaming progress: Ingesting an uncached repository emits progress events with file counts and phase transitions capped at 100 millisecond intervals, verifies **AC-4**.
- Force re ingest: Clicking Force Re ingest sends `forceFresh: true`, re downloads archive, re parses AST, and updates IndexedDB record, verifies **AC-3**.
- Encrypted cookie token: Submitting a personal access token via `/api/auth/github-token` stores encrypted httpOnly cookie and enables higher rate limit quota, verifies **AC-5**.
- Legacy token migration: Storing a token in `sessionStorage` under `github_pat` on app mount migrates it to `/api/auth/github-token` and purges `sessionStorage`, verifies **AC-5**.
- Rate limit modal and auto retry: Simulated 403 response triggers modal countdown, entering valid `ghp_` token sets cookie and automatically resumes ingestion, verifies **AC-5**, **AC-6**.
- Least recently used eviction: Adding an 11th repository record or exceeding 300 megabytes evicts the oldest accessed entry from IndexedDB, verifies **AC-7**.
- Offline fallback: Disconnecting network during submission opens existing cached graph with an offline badge, verifies **AC-8**.
- Schema corruption eviction: Corrupted record with schemaVersion 999 is silently purged from IndexedDB and falls back to fresh ingestion, verifies **AC-9**.

## Build plan

1. [x] Create native typed IndexedDB helper module (`src/lib/storage/indexed-db.ts`) with open, read, write, LRU eviction (300MB quota), and schema validation utilities, satisfies **AC-1**, **AC-7**, **AC-9**
2. [x] Implement encrypted httpOnly cookie route handler (`src/app/api/auth/github-token/route.ts`) with AES 256 GCM encryption and prefix validation, satisfies **AC-5**
3. [x] Update GitHub client and ingestion route (`src/lib/github/client.ts`, `src/app/api/ingest/route.ts`) to read token from cookie, support upstream commit SHA checking via commits API, emit `cache_hit` SSE events, and throttle granular progress events to 100ms intervals, satisfies **AC-2**, **AC-4**, **AC-5**
4. [x] Update `useGraphStore` with cache hydration, legacy token migration, `cache_hit` handling, granular progress metrics, and force fresh re ingestion action, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-8**
5. [x] Build accessible Rate Limit Recovery Dialog (`src/components/workspace/rate-limit-dialog.tsx`) with live countdown timer, permission explanation, token entry, and automatic retry triggering, satisfies **AC-6**
6. [x] Update `RepoSubmissionBar` with two tier progress rendering, cache hit badge, force refresh trigger, and token management status, satisfies **AC-3**, **AC-4**, **AC-6**, **AC-8**

## Consequences

**Positive**:
- Repeat visits to previously analyzed repositories render instantly in under 100 milliseconds.
- Drastic reduction in GitHub rate limit consumption by avoiding redundant tarball downloads.
- Real time file counters provide clear visual feedback during long ingestion passes.
- User personal access tokens achieve security parity with AI provider keys via encrypted httpOnly cookies.
- Graceful offline fallback allows users to review architecture maps on planes or unstable connections.

**Negative / tradeoffs**:
- IndexedDB storage consumes client disk space (capped at 300 megabytes across 10 repositories).
- Checking upstream commit SHA requires a lightweight network request before serving cached graphs.
- Cookie based token storage requires server round trips to configure or clear tokens.

**Neutral**:
- Legacy sessionStorage token keys (`github_pat`) are automatically migrated and removed.
- Browser privacy modes (incognito) may have restricted IndexedDB quotas or wipe storage on window close.

## Follow-up

- [ ] Add canvas export capability (SVG, PNG, JSON) to allow offline sharing without requiring IndexedDB storage.
- [ ] Explore Web Worker parsing for client side AST extraction on user uploaded local zip files.
