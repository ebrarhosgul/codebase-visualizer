# 0005. Walking Skeleton Loop

**Date**: 2026-09-02
**Status**: Accepted

## Summary

This specification establishes the walking skeleton loop for Codebase Visualizer. It provides the initial thin end to end thread connecting public GitHub repository ingestion, in memory archive extraction and abstract syntax tree parsing with ts-morph, hierarchical graph layout with Dagre, interactive React Flow canvas visualization, and side by side source code viewing with Monaco Editor. Completing this slice proves that the entire core pipeline operates smoothly before deepening filtering, deep linking, or semantic search features.

## Requirements

**User stories**:
- As a developer exploring an open source project, I want to paste a public GitHub repository link so that I can immediately inspect its architectural module graph without cloning code locally.
- As an engineer analyzing code structure, I want to see how files import one another in a clear top to bottom layout so that I can understand architectural dependencies at a glance.
- As a software architect inspecting a specific module, I want to click any file node in the canvas and read its raw source code in a side panel so that visual context and code implementation stay connected.

**Acceptance criteria**:
- **AC-1**: Public repository URL validation and default branch discovery. The application validates public GitHub repository URLs (supporting standard formats including `github.com/owner/repo` and optional tree branch suffixes), discovers the repository default branch via GitHub API if omitted, and rejects invalid strings or private repository access with actionable error messages.
- **AC-2**: Server Sent Events ingestion pipeline. A dedicated Next.js route handler (`POST /api/ingest`) streams structured progress events (`validating`, `downloading_archive`, `unpacking_files`, `parsing_ast`, `complete`, `error`) with defensive AbortController cancellation and 30 second timeouts.
- **AC-3**: Single request archive download and shallowest file prioritization. The ingestion pipeline downloads repository source code via a single GitHub tarball archive request (`GET /repos/{owner}/{repo}/tarball/{branch}`) costing exactly 1 rate limit point, unpacks the stream in memory, extracts `tsconfig.json` for path alias resolution, and selects up to 100 TypeScript and JavaScript source files (`.ts`, `.tsx`, `.js`, `.jsx`) prioritizing shallowest directory depth (root and `src/` files first). It accepts an optional personal access token stored in `sessionStorage` to raise rate limits.
- **AC-4**: In memory abstract syntax tree parsing and boundary stub generation. The server uses `ts-morph` in a virtual file system to parse source files, building canonical `FileNode`, `DirectoryNode`, and `file_import` / `re_export` `GraphEdge` entities with line counts, file sizes, and graceful syntax error tolerance (`parseError`). Imports that point outside the 100 file collection or to third party packages create canonical `ExternalModuleNode` stubs (`ext:{packageName}`).
- **AC-5**: Client Dagre hierarchical layout computation. A client layout utility computes non overlapping coordinates using Dagre graph layering based on import dependencies with fixed card dimensions (width 220px, height 72px), ensuring nodes render in an orderly hierarchy rather than stacked at origin.
- **AC-6**: Interactive React Flow canvas rendering. The workspace center panel renders the generated nodes and edges using custom `FileNodeCard` components, fitting the initial view to screen bounds and providing functional zoom, pan, and minimap controls.
- **AC-7**: Side by side Monaco Editor code inspection. Clicking a file node on the canvas synchronizes selection to the right panel Code tab, dynamically mounting Monaco Editor (`@monaco-editor/react`) with syntax highlighting, line numbers, and the selected file source code loaded from in memory store.
- **AC-8**: Dedicated graph client state store. A dedicated Zustand `useGraphStore` manages active repository metadata, parsed `CodebaseGraph`, source code lookup map (`fileSources`), selection states, and streaming ingestion progress, decoupled from workspace layout persistence.
- **AC-9**: Graceful error and rate limit recovery. If a GitHub rate limit (403), missing repository (404), or network timeout occurs, the UI displays a structured error notification with rate limit reset countdown and an inline token input to retry immediately.

## Decision

**Chosen option**: Option 1: Single request tarball archive streaming ingestion with ts-morph in memory parsing, client Dagre layout, React Flow rendering, and dynamic Monaco Editor side panel.

We choose a Next.js 15 route handler that fetches repository tarballs in a single HTTP request, unpacks them in memory to extract up to 100 source files prioritized by shallowest directory depth, parses import relationships with `ts-morph`, and streams progress via Server Sent Events. The client computes layered coordinates using Dagre with fixed card dimensions, displays an interactive React Flow canvas, and provides side by side code inspection via a dynamically imported Monaco Editor.

## Rationale

Reasoning, options considered, and forces: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**:

```typescript
export type IngestionPhase =
  | 'idle'
  | 'validating'
  | 'downloading_archive'
  | 'unpacking_files'
  | 'parsing_ast'
  | 'complete'
  | 'error';

export interface IngestRequest {
  readonly repositoryUrl: string;
  readonly branch?: string;
  readonly githubToken?: string;
}

export interface IngestError {
  readonly code:
    | 'INVALID_URL'
    | 'REPO_NOT_FOUND'
    | 'RATE_LIMITED'
    | 'FILE_LIMIT_EXCEEDED'
    | 'PARSE_FAILED';
  readonly message: string;
  readonly rateLimitReset?: number;
}

export interface IngestProgress {
  readonly phase: IngestionPhase;
  readonly current: number;
  readonly total: number;
  readonly message: string;
}

export interface IngestResult {
  readonly repository: Repository;
  readonly graph: CodebaseGraph;
  readonly fileSources: Readonly<Record<string, string>>;
}

export interface IngestStreamEvent {
  readonly phase: IngestionPhase;
  readonly progress?: IngestProgress;
  readonly result?: IngestResult;
  readonly error?: IngestError;
}

export interface GraphStoreState {
  readonly repository: Repository | null;
  readonly graph: CodebaseGraph | null;
  readonly fileSources: Readonly<Record<string, string>>;
  readonly selectedNodeId: string | null;
  readonly selectedFileId: string | null;
  readonly ingestionPhase: IngestionPhase;
  readonly ingestionProgress: IngestProgress | null;
  readonly ingestionError: IngestError | null;
  readonly isIngesting: boolean;
}
```

**State transitions**:

Ingestion stream state machine:
`idle` -> `validating` -> `downloading_archive` -> `unpacking_files` -> `parsing_ast` -> `complete` (or `error` at any phase)

Node selection state machine:
`none selected` -> `file node clicked` -> `file selected` (updates `selectedNodeId` and `selectedFileId`, switches right panel tab to `code`) -> `canvas background clicked` -> `none selected`

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/api/ingest` | POST | `repositoryUrl: string` (req), `branch: string` (opt), `githubToken: string` (opt) | `ReadableStream<Uint8Array>` (SSE stream with `IngestStreamEvent` chunks) | Public (optional token header) | 400 invalid URL, 404 repo not found, 429 rate limited, 504 timeout |

**Value sourcing**:

| Action | Value produced or displayed | Source |
|---|---|---|
| Ingest request initiation | Target repository URL and optional token | User input from workspace header submission bar |
| URL normalization | Repository owner, name, and optional branch | Regular expression extraction matching GitHub URL formats |
| Default branch resolution | Active repository branch | GitHub REST API `GET /repos/{owner}/{repo}` (queried when branch omitted) |
| Archive download | Gzip compressed repository tarball stream | GitHub REST API `GET /repos/{owner}/{repo}/tarball/{branch}` (single request) |
| Source file selection | Up to 100 `.ts`, `.tsx`, `.js`, `.jsx` file paths and contents | In memory tar extraction prioritized by shallowest directory depth (root and `src/` first) |
| Path alias mapping | Import path alias mappings | Extracted `tsconfig.json` compiler options, defaulting to `@/*` mapped to `./src/*` |
| AST graph construction | Canonical `FileNode`, `DirectoryNode`, `ExternalModuleNode`, and `GraphEdge` entities | `ts-morph` in memory virtual file system parsing import and re export statements |
| Canvas layout placement | Node `(x, y)` coordinate positions | Dagre layout algorithm calculated on client with fixed card dimensions (220px by 72px) |
| Canvas rendering | Interactive node cards and connecting dependency lines | React Flow `@xyflow/react` adapter fed with positioned nodes and edges |
| Code viewer display | Raw source code lines with syntax highlighting | `fileSources` map keyed by selected `FileNode.id` rendered via Monaco Editor |
| Rate limit alert | Reset countdown timestamp and error guidance | GitHub response headers `x-ratelimit-remaining` and `x-ratelimit-reset` |

**Key invariants**:
- Single request download: The backend fetches repository code in exactly one archive request to consume only 1 rate limit point, preserving the 60 requests per hour unauthenticated quota.
- Shallowest depth prioritization: When repositories contain over 100 source files, selection prioritizes root and `src/` files first before nested subdirectories, ensuring deterministic and architecturally relevant graph generation.
- External stub generation: Imports that reference modules outside the 100 file collection or third party npm packages generate canonical `ExternalModuleNode` stubs (`ext:{packageName}`) so dependency edges never point to missing nodes.
- Ephemeral session token storage: User supplied GitHub personal access tokens are kept in browser `sessionStorage` and sent in request headers, never saved to server disk or database.
- Zero server disk persistence: All archive unpacking and AST parsing executes in memory, eliminating temporary directory creation and disk cleanup hazards.
- Graceful syntax failure: Files containing TypeScript syntax errors record a `parseError` property on the resulting `FileNode` without crashing the overall ingestion pipeline.
- Abort controller binding: Closing the browser tab or submitting a new repository URL terminates in flight server requests through `AbortController` signal propagation.
- Deterministic node keys: Canvas node IDs and edge IDs adhere strictly to canonical domain identifiers (`file:{path}`, `dir:{path}`, `edge:{source}->{target}:{kind}`).

**Security model**:
- Ingestion endpoint accepts public repository URLs only.
- User GitHub tokens are passed via header or request body to GitHub API directly; they are never logged or stored on the server.
- Source code contents are delivered directly to the requesting client over HTTPS and kept in client Zustand memory.
- File paths are normalized to eliminate directory traversal risks (`../` stripped).

**Configuration required**:
- `GITHUB_TOKEN`: Optional server side personal access token to raise default unauthenticated rate limits for public requests when user does not supply one.

**Critical test scenarios**:
- Happy path: User submits a valid public GitHub URL, watches SSE progress stages complete, sees the Dagre organized graph render in React Flow, and clicks a file node to view its source code in Monaco Editor, verifies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-6**, **AC-7**, **AC-8**.
- Single request rate limit preservation: Backend downloads a repository using the tarball endpoint, verifying only 1 GitHub request is made for all files, verifies **AC-3**.
- File prioritization over 100 files: A repository with 150 files selects the 100 shallowest files and maps unresolved imports to external stubs, verifies **AC-3**, **AC-4**.
- Rate limit handling: GitHub API returns 403 rate limit response; application captures reset time and renders friendly notification with token input, verifies **AC-3**, **AC-9**.
- Invalid repository URL: User inputs a malformed URL or private repository; route returns immediate structured error, verifies **AC-1**, **AC-9**.
- Cancellation during ingestion: User triggers abort signal while downloading or parsing; route terminates fetch operations cleanly, verifies **AC-2**.
- Syntax error tolerance: Parsing a repository containing invalid TypeScript syntax produces a valid graph with error flags on affected nodes, verifies **AC-4**.

## Build plan

Ordered build tasks following the Tracer Bullet delivery approach:

1. [x] Install project dependencies `@monaco-editor/react`, `ts-morph`, `@dagrejs/dagre`, `@types/dagre`, `tar-stream`, and `@types/tar-stream`, satisfies **AC-3**, **AC-4**, **AC-5**, **AC-7**
2. [x] Implement GitHub repository archive client and default branch resolver (`src/lib/github/`), downloading tarball streams and parsing rate limit headers, satisfies **AC-1**, **AC-3**, **AC-9**
3. [x] Build in memory archive unpacker and AST parser using `tar-stream` and `ts-morph` to select shallowest files, resolve path aliases, and generate canonical files, directories, external stubs, and import edges (`src/lib/parser/`), satisfies **AC-3**, **AC-4**
4. [x] Construct Next.js streaming route handler (`src/app/api/ingest/route.ts`) supporting Server Sent Events, progress updates, and abort signals, satisfies **AC-1**, **AC-2**, **AC-9**
5. [x] Create dedicated client graph store `useGraphStore` (`src/stores/graph-store.ts`) for graph data, file sources, selection, and stream consumption, satisfies **AC-2**, **AC-8**
6. [x] Implement client Dagre hierarchical layout utility (`src/graph/layout/dagre-layout.ts`) using 220px by 72px node card dimensions to assign coordinates for React Flow elements, satisfies **AC-5**
7. [x] Build repository submission bar with URL validation, branch input, session token storage, and progress indicator component in the workspace header, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-9**
8. [x] Wire React Flow center canvas to live graph store with custom node cards, fit view behavior, and click selection handlers, satisfies **AC-6**, **AC-8**
9. [x] Implement Monaco Editor code viewer tab in right panel with dynamic client side loading and syntax highlighting (`src/components/editor/code-viewer.tsx`), satisfies **AC-7**, **AC-8**
10. [x] Write unit and integration test suite covering GitHub URL parser, archive extraction, AST import extraction, Dagre layout calculations, graph store transitions, and Monaco mounting, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-6**, **AC-7**, **AC-8**, **AC-9**

## Consequences

**Positive**:
- Validates the complete product loop from user repository input to visual graph exploration and code inspection.
- Single archive tarball download consumes only 1 GitHub rate limit point instead of dozens, avoiding instant rate limit lockouts.
- In memory parsing keeps serverless functions fast, portable, and free of disk management issues.
- Server Sent Events provide clear progress feedback so users know their repository is actively processing.
- Using Dagre with explicit card dimensions creates predictable hierarchical arrangements where dependency flow is immediately obvious.
- Dedicated graph store isolates heavy graph structures from lightweight layout preferences.

**Negative / tradeoffs**:
- Capping ingestion at 100 source files means very large codebases cannot be fully parsed in this initial slice without directory filtering.
- In memory tarball unpacking requires streaming decompression libraries (`tar-stream`).
- Monaco Editor increases client bundle size and requires dynamic loading to avoid slowing initial page load.

**Neutral**:
- Later slices will add directory level clustering, symbol level call graph expansion, and IndexedDB caching on top of this foundation.

## Follow-up

- [ ] Add directory collapsing and architectural layer grouping in Slice 3.
- [ ] Connect symbol level declarations inside files to editor line scroll anchors in Slice 2.
- [ ] Add client side IndexedDB caching to avoid re fetching parsed repositories in Slice 5.
