# Codebase Architecture & Dependency Graph Visualization Engine

A high performance, client-first architectural exploration engine that ingests, parses, models, and visualizes complex TypeScript and JavaScript codebases. The system combines in-memory abstract syntax tree (AST) traversal, deterministic hierarchical graph layout, bidirectional code deep-linking, multi-provider streaming artificial intelligence query tracing, and local-first persistence.

---

## 1. Architectural Overview

The engine transforms unstructured source repositories into canonical, queryable dependency graphs. Traditional repository viewers operate on raw file trees or basic symbol lists; this engine models software architecture as a directed cyclic graph of modules, declarations, and invocations.

The architecture is composed of six core systems:

1. **Ingestion & Archive Pipeline**: Streams repository archives from GitHub using minimal API quotas, unpacks compressed tarballs in memory, filters irrelevant assets, and prepares source files for compilation.
2. **Abstract Syntax Tree Extraction Engine**: Evaluates codebases in an isolated virtual filesystem via `ts-morph`, resolving TypeScript path mappings and extracting high-fidelity entity declarations with exact character and line coordinates.
3. **Graph Modeling & Layout Computation**: Builds an immutable, typed domain model with deterministic identity schemes, classifies files into architectural layers, detects cyclic relationships, and computes collision-free Cartesian positions through Dagre.
4. **Bidirectional Deep-Linking Bridge**: Synchronizes viewport selections between a virtualized React Flow canvas and a Monaco Editor instance through a dual-guard concurrency lock preventing cursor feedback loops.
5. **Streaming LLM Query & Path Tracing Layer**: Provides a provider-agnostic artificial intelligence bridge (Claude, OpenAI, Gemini, and local Demo) communicating over Server-Sent Events (SSE) to trace dependency chains and explain architectural boundaries with circuit-breaker fallbacks.
6. **Local-First Persistence & Caching Engine**: Manages client-side storage in IndexedDB with commit-hash verification, atomic LRU cache eviction, and seamless offline failover.

---

## 2. Core Architecture & Subsystems

### Ingestion & AST Parsing

```
GitHub Archive Tarball (.tar.gz)
           │
           ▼
[fetchTarballArchive] (1 API quota point, streaming buffer)
           │
           ▼
[unpackRepositoryTarball] (node:zlib + tar-stream)
  ├── Excludes non-source artifacts (node_modules, .git, dist, coverage)
  ├── Enforces MAX_INDIVIDUAL_FILE_BYTES (1 MB safety limit)
  └── Scores file depth: root and src/ prioritized first
           │
           ▼
[extractPathAliases] (Parses tsconfig.json compilerOptions.paths & baseUrl)
           │
           ▼
[parseRepositoryAst] (ts-morph in-memory Project)
  ├── Extracts SourceFile, DirectoryNode, FileNode, and SymbolNode records
  ├── Resolves module specifiers against aliases and relative paths
  └── Emits typed GraphEdge entities (file_import, re_export)
```

#### GitHub Tarball Extraction

Repository ingestion bypasses recursive GitHub Git Trees API calls, which exhaust rate limits on large projects. Instead, `fetchTarballArchive` (`src/lib/github/client.ts`) requests a compressed archive tarball from `/repos/{owner}/{repo}/tarball/{branch}` in a single HTTP request consuming exactly 1 rate-limit point.

The in-memory extractor `unpackRepositoryTarball` (`src/lib/parser/tar-extractor.ts`) decodes the stream using `createGunzip()` and `tar-stream`. It filters ignored prefixes (`node_modules/`, `.git/`, `.next/`, `dist/`, `build/`, `coverage/`, `.turbo/`, `.github/`, `.vscode/`), strips the dynamic root folder injected by GitHub, rejects single files exceeding 1 MB (`MAX_INDIVIDUAL_FILE_BYTES`), and prioritizes files using `calculateFileDepthScore` so that root configuration and `src/` modules take precedence if collection caps are met.

#### Path Alias Resolution

Import resolution must adhere to compiler configurations. `extractPathAliases` (`src/lib/parser/path-alias.ts`) strips comments from `tsconfig.json` or `jsconfig.json`, extracts `compilerOptions.baseUrl` and `compilerOptions.paths`, and constructs a normalized `PathAliasMap`.

`resolveModuleSpecifier` handles three resolution stages:

1. Relative specifiers (`./`, `../`): Normalized via directory stack traversal and matched against candidates (`.ts`, `.tsx`, `.js`, `.jsx`, `/index.ts`, `/index.tsx`).
2. Aliased paths (`@/*`, `~/*`): Strips prefix wildcards and maps to base directory targets.
3. External packages: Distinguishes internal modules from third-party vendor packages (scoped `@scope/pkg` or standard modules), generating synthetic `ExternalModuleNode` records.

#### Browser-Side AST Traversal

`parseRepositoryAst` (`src/lib/parser/ast-parser.ts`) constructs an in-memory `ts-morph` `Project` with compiler flags set to `allowJs: true` and `jsx: Preserve`. For every source file, it runs:

- **Symbol Extraction**: Locates functions, classes, methods, interfaces, type aliases, enums, and variable statements. Each symbol captures exact `SourceLocation` metadata (1-indexed line/column coordinates and 0-indexed character offsets) and JSDoc documentation.
- **Syntactic Diagnostics**: Queries `program.getSyntacticDiagnostics()` to surface non-fatal syntax warnings (`parseError`) without terminating the ingestion pipeline.
- **Edge Generation**: Analyzes `ImportDeclaration` and `ExportDeclaration` statements to emit directed `GraphEdge` entities (`file_import`, `re_export`) with aggregated weight counters.

---

### Graph Modeling & Deterministic Layout

#### Canonical Entity Abstractions

All entities are strictly validated by Zod schemas (`src/entities/`) and frozen as immutable records:

| Entity               | Identifier Format                    | Description                                                         |
| -------------------- | ------------------------------------ | ------------------------------------------------------------------- |
| `Repository`         | `repo:{owner}/{name}`                | Metadata, commit SHA, language distribution, and schema version.    |
| `DirectoryNode`      | `dir:{path}`                         | Structural hierarchy container with parent and child links.         |
| `FileNode`           | `file:{path}`                        | File entity with language, size, line count, and symbol references. |
| `SymbolNode`         | `symbol:{filePath}#{name}`           | Code symbol with range, visibility, docstring, and signature.       |
| `ExternalModuleNode` | `ext:{packageName}`                  | Third-party dependency placeholder (e.g. `ext:react`).              |
| `GraphEdge`          | `edge:{sourceId}->{targetId}:{kind}` | Directed relationship with aggregated weight and call sites.        |
| `PathTrace`          | `trace:{uuid}`                       | Shortest directed path connecting two distant nodes.                |

Anonymous functions and closures use coordinate-anchored identifiers (`symbol:{path}#{name}$anon@L{line}C{col}`) to prevent collision across identical signatures.

#### Edge Aggregation

When multiple import statements or call expressions connect the same source and target nodes, `aggregateEdge` merges them into a single canonical edge. The edge increments its `weight` property and appends specifiers to `metadata.importSpecifiers` and locations to `metadata.callSites`, avoiding visual edge clutter on the graph canvas while preserving precise structural metrics.

#### Architectural Layer Classification

`classifyLayerForPath` (`src/graph/layers.ts`) assigns files into standardized architectural tiers using prioritized path-segment heuristics:

```
Rank 1: Components (components, ui, views, widgets)
Rank 2: Hooks      (hooks, composables)
Rank 3: Stores     (stores, state, context, slices)
Rank 4: Entities   (entities, models, types, schemas)
Rank 5: Library    (lib, services, core, sdk)
Rank 6: API        (api, server, routes, controllers)
Rank 7: Utilities  (utils, helpers, shared, common)
Rank 8: App        (app, pages, layouts)
Rank 9: Other      (uncategorized assets)
```

#### Cycle-Safe Traversal & Path Tracing

Cycles are standard in TypeScript codebases due to mutual imports or recursive patterns. `traverseGraph` (`src/graph/traversal.ts`) and `findDependencyPath` (`src/graph/path-trace.ts`) utilize a precomputed `AdjacencyIndex` (`outgoing` and `incoming` record lookup tables) alongside a `visited: Set<string>` guard. Path discovery uses breadth-first search (BFS) to yield the shortest dependency path without risking call-stack overflow or infinite loops.

For disconnected modules, `findClosestCommonAncestor` (`src/graph/path-validation.ts`) computes directory separation distances to provide clear structural context when no direct import path exists.

#### Deterministic Dagre Layout Engine

`computeDagreLayout` (`src/graph/layout/dagre-layout.ts`) executes non-overlapping Cartesian coordinate positioning.

When `groupByFolder` is enabled, a two-level hierarchical algorithm runs:

1. **Cluster Partitioning**: Files are grouped into directory clusters. Child cards are sorted alphabetically and laid out in calculated multi-column internal grids ($W_{cluster} = 2 \cdot \text{pad}_x + c \cdot w_{node} + (c-1) \cdot \text{gap}_x$).
2. **Inter-Folder Macro Layout**: A macro-graph representing folders as compound nodes is constructed with edges aggregated from inter-file dependencies.
3. **Dagre Execution**: Dagre calculates non-overlapping positions for folder macro-nodes.
4. **Child Placement**: Member file nodes are assigned deterministic absolute coordinates shifted by their container's top-left origin.

---

### Bidirectional Deep-Linking

The architecture maintains tight state synchronization between the graph canvas (macro view) and the Monaco code editor (micro view). Selecting an entity in either surface immediately updates the companion view.

```
                  ┌─────────────────────────────────────┐
                  │          Zustand Store              │
                  │        (useGraphStore)              │
                  │                                     │
                  │  activeTarget: NavigationTarget     │
                  │  lockedUntil: timestamp             │
                  │  lastProgrammaticTarget: {file,line}│
                  └───────▲─────────────────────▲───────┘
                          │                     │
           Canvas Click   │                     │  Cursor Moved
         (Sets lock 300ms)│                     │  (Debounced 150ms)
                          │                     │
               ┌──────────┴─────────┐ ┌─────────┴──────────┐
               │                    │ │                    │
               │  React Flow Canvas │ │   Monaco Editor    │
               │  (Node / Symbol)   │ │  (revealLineInCtr) │
               │                    │ │                    │
               └────────────────────┘ └────────────────────┘
```

#### Dual-Guard Anti-Feedback Loop

Because moving the cursor in Monaco emits cursor-change events that can trigger graph node selection, an unconstrained architecture produces an infinite ping-pong loop. `useGraphStore` (`src/stores/graph-store.ts`) and `CodeViewer` (`src/components/editor/code-viewer.tsx`) implement a dual-guard mechanism:

1. **Temporal Guard (`lockedUntil`)**: When a navigation target originates programmatically from the canvas, URL, or file explorer, `lockedUntil` is set to `Date.now() + 300`. The editor's `onDidChangeCursorPosition` listener checks `now < state.lockedUntil` and drops inbound events while the lock is active.
2. **Identity Guard (`lastProgrammaticTarget`)**: The store records `{ fileId, line }` from programmatic dispatches. When the editor event fires after smooth scrolling, it compares its cursor coordinate against `lastProgrammaticTarget`. If identical, propagation is halted.

#### Innermost Symbol Resolution

When an engineer moves the editor cursor through a file, the editor debounces the coordinate (150 ms) and iterates over the file's `symbolIds`. It computes the smallest enclosing span where $\text{startLine} \le \text{cursorLine} \le \text{endLine}$ ($\min(\text{endLine} - \text{startLine})$), selecting the exact declaration on the canvas.

#### Asynchronous URL Hydration

Permalinks encode state via query parameters (`?repo=...&branch=...&file=...&line=...&symbol=...`). If a link is opened directly, parameters arrive before the repository archive is fetched or parsed. The store buffers the request in `pendingTarget` via `bufferDeepLink`. Once `parseRepositoryAst` finishes, `flushPendingDeepLink` resolves the target against the compiled graph, applying visual pulse decorations (`monaco-pulse-line`) or displaying descriptive fallback notifications if a file has been renamed.

---

### Streaming LLM Layer & Security

The query subsystem provides semantic architectural analysis, dependency path explanations, and source citations without vendor lock-in.

```
Client UI (TracePanel)
       │
       ▼  POST /api/ai/query (ReadableStream)
[Route Handler]
  ├── Rate Limiter (IP sliding window: 10 req/min standard, 30 req/min demo)
  ├── Cookie Decryption (AES-256-GCM via Web Crypto / Node crypto)
  └── Provider Registry (Selects Gemini, OpenAI, Claude, or Demo provider)
           │
           ▼
[AIProvider.streamQuery] (Yields AsyncGenerator<AIStreamEvent>)
  ├── Formats prompt with CodebaseGraph summary & active node context
  ├── Streams tokens via SSE (data: {"type":"token","content":"..."})
  ├── Resolves and validates dependency chains against graph edges
  └── Catches failures -> classifyError -> Emits typed fallbackNotice
```

#### Provider-Agnostic Abstraction

All model integrations adhere to the `AIProvider` contract (`src/lib/ai/types.ts`):

```typescript
export interface AIProvider {
  readonly id: AiProviderId | "demo";
  readonly displayName: string;
  streamQuery(
    messages: readonly AIMessage[],
    context: AIRequestContext,
    apiKey?: string,
    signal?: AbortSignal,
  ): AsyncGenerator<AIStreamEvent>;
}
```

Implementations include:

- `GeminiAIProvider`: Uses `@google/genai` targeting Google Gemini models.
- `OpenAIProvider`: Implements OpenAI streaming chat completions.
- `ClaudeProvider`: Integrates Anthropic Claude models over fetch streams.
- `DemoAIProvider`: A local offline provider using deterministic graph pattern matching to demonstrate capabilities without credentials.

#### Server-Sent Events (SSE) Pipeline

The route handler `POST /api/ai/query` establishes an SSE stream (`text/event-stream`) with headers `Cache-Control: no-cache, no-transform` and `X-Accel-Buffering: no`. Events are delivered in standardized JSON envelopes:

- `token`: Incremental Markdown text chunks.
- `citation`: Structured source references with line numbers.
- `path_trace`: Validated dependency sequences connecting referenced components.
- `error`: Structured fallback payloads containing remediation options.

#### Error Classification & Sanitization

Upstream provider exceptions pass through `classifyError` (`src/lib/ai/error-classifier.ts`). The sanitizer strips sensitive material (Gemini API keys, OpenAI keys, Anthropic tokens, Bearer tokens, query parameters, and local file paths).

Errors are categorized into explicit domain codes with user actions:

- `rate_limit`: Suggests switching to Demo Mode or displays a countdown timer.
- `auth_error`: Prompts opening the Key Settings modal.
- `network_timeout`: Recommends local offline exploration.
- `provider_outage`: Signals upstream downtime.

#### Credential Security & Encryption

The engine implements Bring-Your-Own-Key (BYOK). Keys are never committed to disk, persisted in database tables, or logged:

- **Server Storage**: Keys are encrypted using AES-256-GCM (`src/lib/ai/crypto.ts`) with a 96-bit initialization vector (`iv`), 128-bit authentication tag (`authTag`), and SHA-256 derived keys from `AI_COOKIE_SECRET`. Encrypted strings are placed in `httpOnly`, `SameSite=Strict` cookies (`cv_ai_key`).
- **GitHub PAT**: Personal access tokens for GitHub are handled identically via `GITHUB_PAT_COOKIE_NAME` and encrypted via `encryptGithubToken` (`src/lib/github/crypto.ts`).

---

### Local-First Persistence

```
+-------------------------------------------------------------+
|               IndexedDB: codebase_visualizer_cache_v1       |
|               ObjectStore: repositories (Key: owner/repo:branch) |
+-------------------------------------------------------------+
|  Indexes:                                                   |
|   ├── by_last_accessed (lastAccessedAt)                     |
|   ├── by_repo          (repoKey: owner/repo)                |
|   └── by_commit        (commitSha)                          |
+-------------------------------------------------------------+
|  Record Payload:                                            |
|   ├── schemaVersion: 1 (CURRENT_SCHEMA_VERSION)             |
|   ├── graph: CodebaseGraph (Serialized domain entities)     |
|   ├── fileSources: Record<string, string> (Raw source text) |
|   ├── byteSize: number (Calculated record weight)           |
|   └── lastAccessedAt: number (Timestamp for LRU eviction)   |
+-------------------------------------------------------------+
```

#### IndexedDB Storage Engine

`src/lib/storage/indexed-db.ts` provides transactional client storage. Repositories are stored under composite keys formatted as `owner/repo:branch`.

- **Schema Guarding**: Stored records carry `schemaVersion: 1`. On hydration, `getCachedRepository` checks the version against `CURRENT_SCHEMA_VERSION`. If mismatched or corrupted, the record is purged and null is returned.
- **LRU Eviction**: To prevent unbounded storage consumption, `saveCachedRepository` enforces two hard limits:
  - `MAX_CACHED_REPOSITORIES`: Maximum 10 repositories.
  - `MAX_CACHE_BYTES`: Maximum 300 megabytes.
    When either threshold is breached, records sorted by `lastAccessedAt` ascending are deleted in an atomic transaction before saving the new repository.
- **Commit Verification & Offline Failover**: On ingestion, `POST /api/ingest` verifies the remote branch HEAD commit hash via GitHub API. If the hash matches `cachedCommitSha`, an SSE `complete` event with `cached: true` instructs the client to hydrate directly from IndexedDB in milliseconds. If the network is unavailable, the client catches the connection failure and falls back to the cached snapshot.

---

## 3. Architecture & Data Flow Diagram

```
+─────────────────────────────────────────────────────────────────────────────+
|                              DATA LIFECYCLE                                 |
+─────────────────────────────────────────────────────────────────────────────+

  1. INGESTION
     User Input (GitHub URL) ───► POST /api/ingest
                                        │
                                        ├──► GitHub API (Commit SHA check)
                                        │      └── Match? ──► Emit cached: true ──┐
                                        └──► GitHub Tarball Stream (.tar.gz)      │
                                                                                  │
  2. DECOMPRESSION & PARSING                                                      │
     Unpack Gzip Buffer (node:zlib)                                               │
           │                                                                      │
     Extract Files (tar-stream)                                                   │
           │                                                                      │
     Parse tsconfig.json (extractPathAliases)                                     │
           │                                                                      │
     Traverse AST (ts-morph virtual Project)                                      │
           │                                                                      │
           ├── Symbols (classes, functions, interfaces, methods)                  │
           ├── Files & Directories (hierarchy trees)                              │
           └── Dependencies (import/export edges with aggregated weights)         │
           │                                                                      │
  3. STATE HYDRATION                                                              │
     Canonical CodebaseGraph ──► Zod Schema Validation                            │
           │                                                                      │
           ├──► IndexedDB Cache (Background async write with LRU) ◄───────────────┘
           │
           ▼
  4. CLIENT STATE PIPELINE (Zustand Entity Store)
     useGraphStore.setState({ graph, fileSources, repository })
           │
           ├──► Layer Classification (classifyArchitecturalLayers)
           └──► Scope Filtering (filterAndAggregateGraph)
                      │
                      ▼
  5. LAYOUT & PROJECTION (Dagre Engine)
     toReactFlowElements(filteredGraph)
           │
           ▼
     computeDagreLayout(elements, { groupByFolder: true })
           ├── Partition into Directory Clusters
           ├── Dagre Inter-Folder Macro-Layout
           └── Sub-card Grid Coordinate Offset Mapping
                      │
                      ▼
  6. PRESENTATION & SYNCHRONIZATION
     ┌───────────────────────────────────┬───────────────────────────────────┐
     │         React Flow Canvas         │        Monaco Code Viewer         │
     │                                   │                                   │
     │  - Virtualized Node Cards         │  - Read-only Syntax Highlighting  │
     │  - Aggregated / Bundled Edges     │  - Smooth Line Reveal             │
     │  - Path Trace Overlays            │  - Pulse Highlight Decoration     │
     └─────────────────▲─────────────────┴─────────────────▲─────────────────┘
                       │                                   │
                       └───── Dual-Guard Deep-Link Loop ───┘
```

---

## 4. Technology Stack & Design Decisions

| Technology                           | Role                                   | Justification                                                                                                                                                                         |
| ------------------------------------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Next.js 15 (App Router)**          | Application Framework & Edge Streaming | Enables React Server Components for shell delivery and Route Handlers for high-throughput Server-Sent Events (`ReadableStream`), bypassing Node.js HTTP server boilerplate.           |
| **TypeScript 5 (Strict Mode)**       | Type System & Correctness              | Eliminates runtime type errors across complex graph hierarchies. Employs strict null checks, no `any` types, and exhaustive discriminated unions for entities and events.             |
| **React Flow (`@xyflow/react` v12)** | Interactive Graph Canvas               | Provides hardware-accelerated canvas pan and zoom, custom node component rendering, edge routing, and viewport culling essential for hundreds of nodes.                               |
| **Dagre (`@dagrejs/dagre`)**         | Graph Layout Engine                    | Implements Sugiyama-style layered directed graph layout. Computes deterministic Cartesian coordinates and minimizes edge crossings without requiring physical simulation overhead.    |
| **ts-morph**                         | TypeScript AST Compiler Wrapper        | Provides an abstract syntax tree API operating over an isolated virtual memory file system without requiring files to be written to local disks.                                      |
| **Zustand v5**                       | Global State Management                | Lightweight store architecture with zero React context provider bloat. Enables selective state subscriptions to prevent expensive canvas re-renders during rapid cursor tracking.     |
| **IndexedDB**                        | Local-First Persistence Engine         | Client-side database providing structured key-value storage with multi-hundred megabyte capacity, overcoming `localStorage` 5 MB limits for storing large AST models and source text. |
| **Tailwind CSS v4**                  | Design System & Styling                | Delivers high-density dark-mode styling synchronized with CSS variables, high-performance utility classes, and zero-runtime CSS generation.                                           |
| **Vitest v4**                        | Automated Testing Gate                 | Native ESM test runner providing instant startup, isolated jsdom environments, and high-speed execution for unit and integration suites.                                              |

---

## 5. Verification, Quality Gates & Local Setup

### Prerequisites

- Node.js 22 LTS or higher
- npm 10 or higher

### Installation

```bash
# Clone the repository
git clone https://github.com/ebrarhosgul/codebase-visualizer.git
cd codebase-visualizer

# Install dependencies
npm install
```

### Environment Configuration

Create a `.env.local` file in the project root to configure optional API keys:

```bash
# Optional: Server-side GitHub token for higher baseline API rate limits (60 -> 5,000 req/hr)
GITHUB_TOKEN=your_github_personal_access_token

# Optional: Server-side fallback LLM keys (Users can also provide keys via client-side BYOK)
GEMINI_API_KEY=your_gemini_api_key
OPENAI_API_KEY=your_openai_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key

# Encryption secrets (Used to encrypt client session cookies for BYOK keys)
AI_COOKIE_SECRET=at-least-32-characters-random-secret-key
COOKIE_ENCRYPTION_KEY=at-least-32-characters-random-secret-key
```

### Quality Verification Gates

The repository maintains strict verification gates that must pass before any code integration:

```bash
# 1. Type Check (Strict TypeScript compilation without emitting output)
npm run typecheck

# 2. Linting (ESLint with Next.js and Prettier configs)
npm run lint

# 3. Unit and Integration Tests (Vitest test suite)
npm test

# 4. Production Build Verification
npm run build
```

The automated test suite covers 46 test files and 456 unit/integration tests spanning AST extraction, path alias resolution, Dagre positioning, cyclic graph navigation, deep-link synchronization, SSE streaming, error classification, and IndexedDB caching.

### Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to access the visualizer.

---

## 6. Scalability Constraints & Roadmap

### Current Engineering Constraints

1. **DOM Node Scaling in Visual Canvas**:
   React Flow renders custom nodes as individual DOM elements inside an SVG/HTML viewport. While effective for repositories up to 300 files and 2,000 symbols, repositories exceeding 1,000 visible nodes experience frame drops during panning and zooming due to browser layout recalculation.
2. **Main-Thread AST and Layout Computation**:
   Currently, `ts-morph` AST extraction and Dagre layout calculations execute synchronously on the JavaScript engine thread. On large repositories (>500 files), this computation occupies the event loop for several seconds, causing transient interface unresponsiveness.
3. **Memory Ceilings on Large Monorepos**:
   Storing full source code dictionaries alongside complete AST symbol tables in client memory can consume 100 to 200 MB of heap for a single large repository. While IndexedDB handles the persistence, tab heap limits must be protected.

### Architectural Roadmap

- [ ] **Web Worker Layout & Parsing Isolation**: Offload `ts-morph` AST extraction and Dagre coordinate calculations to dedicated background Web Workers (`worker_threads` / Web Worker API via Comlink), ensuring the main browser thread remains at 60 FPS throughout ingestion.
- [ ] **Canvas Level-of-Detail (LOD) & Subgraph Virtualization**: Introduce hierarchical level-of-detail culling. Directory clusters remain aggregated into macro-cards until the user zooms into a specific threshold, bounding rendered active DOM nodes to under 150 elements regardless of codebase size.
- [ ] **Rust / WebAssembly AST Engine**: Replace JavaScript-based TypeScript compiler traversal with an optimized WebAssembly parser (such as `oxc` or `swc-wasm`) to achieve sub-second AST extraction across multi-thousand-file enterprise monorepos.
- [ ] **Incremental Git Diff Overlays**: Allow users to compare commits or pull requests, highlighting modified files and invalidated dependency edges directly on the architecture canvas.
