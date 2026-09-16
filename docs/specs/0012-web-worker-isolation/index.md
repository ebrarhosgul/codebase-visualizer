# 0012. Web Worker isolation for layout and parsing computations

**Date**: 2026-09-16
**Status**: In Progress

## Summary

This specification introduces a dedicated Web Worker to run heavy graph filtering and Dagre layout calculations off the browser main thread. Offloading these computations stops canvas freezing and frame drops when users open large repositories, toggle architectural layers, collapse directory folders, or search symbols. The client retains visible nodes and edges while calculations run in the background, smoothly updating positions when results arrive. If the user rapidly toggles filters while a layout is calculating, the client terminates the busy worker and starts fresh to avoid queued delays. An automatic fallback executes layout functions on the main thread strictly when Web Workers are unavailable in headless test environments.

## Requirements

**User stories**:
- As a developer exploring large codebases, I want graph filtering and layout positioning to calculate in a background thread so that the canvas remains interactive and the browser never freezes.
- As a developer filtering layers or collapsing directories, I want rapid UI interactions to supersede previous pending calculations immediately so that only the latest graph state renders without queued backlog.
- As a developer running unit and integration tests, I want layout logic to fall back to the main thread cleanly when running in test environments without Web Worker support.

**Acceptance criteria**:
- **AC-1**: Dagre hierarchical layout positioning and compound directory bounding box calculations execute inside a dedicated Web Worker off the browser main UI thread.
- **AC-2**: Architectural layer filtering, plain string search token matching via matchesSearchTokens, and React Flow element adaptation run within the worker pipeline, returning positioned nodes and styled edges to the main thread.
- **AC-3**: Monotonic request identifier tracking and busy worker termination ensure rapid UI interactions supersede previous pending calculations. If a new calculation request arrives while the worker is actively computing, the client immediately terminates the busy worker and spawns a fresh worker with the latest request, preventing queued calculation backlogs.
- **AC-4**: During background worker layout computation, existing canvas nodes and edges remain visible and interactive with an unobtrusive progress spinner in the canvas controls toolbar, avoiding canvas blanking or interaction locks.
- **AC-5**: Automatic synchronous fallback executes pure layout functions directly on the main thread strictly when window.Worker is undefined or fails to instantiate, preserving test suite execution in Vitest jsdom and server side rendering environments.
- **AC-6**: Worker communication implements a 5000 millisecond timeout guard. If a calculation times out or the worker crashes, the client terminates the worker, logs a warning, and presents a graceful canvas error notice without freezing the main UI thread with a hanging fallback calculation.
- **AC-7**: Shared worker messaging utilities under src/lib/workers/ establish typed request, response, and error envelope contracts reusable by future background worker tasks such as client side parsing.
- **AC-8**: Repositories containing 300 or more nodes compute layout without blocking the browser main thread for more than 50 milliseconds, maintaining frame rates above 55 frames per second during filter changes.

## Decision

**Chosen option**: Option 2: Dedicated Web Worker for layout positioning and graph filtering with busy worker termination, typed client service, and test synchronous fallback.

This approach offloads both Dagre hierarchical positioning and graph filtering into a single background Web Worker using native Next.js ECMAScript module worker support, backed by an automatic synchronous fallback for headless and test environments.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**:

```typescript
// src/lib/workers/worker-types.ts
export type WorkerErrorCode =
  | "LAYOUT_FAILED"
  | "INVALID_INPUT"
  | "TIMEOUT"
  | "INTERNAL_ERROR";

export interface WorkerEnvelope<TType extends string, TPayload> {
  readonly id: string;
  readonly type: TType;
  readonly payload: TPayload;
  readonly timestamp: number;
}

export interface LayoutWorkerRequestPayload {
  readonly graph: CodebaseGraph;
  readonly filters: GraphFilterOptions;
  readonly options: DagreLayoutOptions;
}

export type LayoutWorkerRequest = WorkerEnvelope<
  "COMPUTE_LAYOUT",
  LayoutWorkerRequestPayload
>;

export interface LayoutWorkerSuccessPayload {
  readonly nodes: readonly CodebaseReactFlowNode[];
  readonly edges: readonly CodebaseReactFlowEdge[];
  readonly durationMs: number;
}

export type LayoutWorkerSuccessResponse = WorkerEnvelope<
  "LAYOUT_SUCCESS",
  LayoutWorkerSuccessPayload
>;

export interface LayoutWorkerErrorPayload {
  readonly code: WorkerErrorCode;
  readonly message: string;
}

export type LayoutWorkerErrorResponse = WorkerEnvelope<
  "LAYOUT_ERROR",
  LayoutWorkerErrorPayload
>;

export type LayoutWorkerResponse =
  | LayoutWorkerSuccessResponse
  | LayoutWorkerErrorResponse;
```

**State transitions**:
- Worker Lifecycle: UNINITIALIZED -> READY -> BUSY -> READY (or BUSY -> TERMINATED -> READY on rapid superseding, or ERROR -> TERMINATED -> READY on recovery)
- Layout Request State: IDLE -> CALCULATING -> RESOLVED (or SUPERSEDED if newer request arrives, or TIMED_OUT if exceeding 5000ms)

**API surface**:

| Module / Hook | Method / Signature | Key inputs | Key outputs | Execution context | Key errors |
| --- | --- | --- | --- | --- | --- |
| layoutWorkerClient | computeLayout(params) | graph, filters, options | Promise<{ nodes, edges, durationMs }> | Main thread singleton | Discards stale requests, terminates busy worker on supersede, handles timeout |
| layoutWorkerClient | terminate() | none | void | Main thread singleton | Cleans up worker instance |
| useAsyncGraphLayout | useAsyncGraphLayout(graph, filters, options) | graph, filters, options | { nodes, edges, isCalculating, error } | React canvas hook | Debounces inputs by 50ms, guards unmount |
| layout.worker.ts | onmessage(event) | LayoutWorkerRequest | LayoutWorkerResponse via postMessage | Dedicated Web Worker | Catches exceptions and returns typed error |

**Value sourcing**:

| Action | Value produced / displayed | Source |
| --- | --- | --- |
| computeLayout | Node dimensions (width, height) | Constant layout options (240px by 80px) in DagreLayoutOptions, zero DOM measurement needed |
| computeLayout | Node positions (x, y) | Computed by Dagre inside Web Worker from graph files and directories |
| computeLayout | Directory bounds (width, height) | Computed by compound directory grouping in worker from child node extents |
| computeLayout | Styled React Flow edges | Built inside Web Worker by toReactFlowElements using graph edges |
| computeLayout | Search filter matches | Filtered inside worker using matchesSearchTokens against file paths and symbol names |
| computeLayout | Execution duration in milliseconds | Measured inside worker via performance.now() |
| useAsyncGraphLayout | Progress indicator visibility | Derived from isCalculating state in hook and Zustand store |
| Canvas update | Camera viewport bounds | Calculated by fitView using incoming worker node coordinates |

**Key invariants**:
- Node coordinates and edge definitions produced by the Web Worker must exactly match outputs produced by the synchronous computeDagreLayout implementation.
- Worker outputs must contain strictly plain JSON serializable data objects. React component mappings (nodeTypes and edgeTypes) remain exclusively on the main thread canvas.
- When a new layout request arrives while the worker is busy, the client terminates the busy worker immediately to eliminate queuing latency for the user.
- The synchronous fallback runs strictly when window.Worker is undefined (such as in Vitest jsdom tests). A worker timeout or crash surfaces an error notice and never freezes the main thread.
- The Web Worker runs strictly as a compute sandbox with zero DOM access, zero window access, and zero network calls.

**Security model**:
- Zero network and zero DOM isolation: The worker executes purely mathematical graph algorithms and layout transformations.
- Origin scoping: The worker script is bundled as a static same origin ECMAScript module by Next.js.
- Memory hygiene: In flight promises hold minimal object references, and aborted or superseded requests release references immediately.

**Configuration required**:
- None. Next.js 15 supports native Web Workers using new Worker(new URL(...), import.meta.url) with zero additional configuration or webpack plugins.

**Critical test scenarios**:
- Happy path: Large graph with 300 nodes computes layout coordinates via Web Worker, verifies **AC-1**, **AC-2**, and **AC-8**.
- Rapid superseding: Triggering a second layout request while the first is calculating terminates the busy worker and resolves the second request without queuing delay, verifies **AC-3**.
- Non blocking canvas: Canvas remains draggable and responsive while background calculation runs, verifies **AC-4**.
- Synchronous fallback in tests: Running layout computation in an environment with window.Worker undefined produces identical node and edge layouts synchronously without errors, verifies **AC-5**.
- Timeout handling: Simulating worker freeze past 5000 milliseconds terminates the worker, surfaces an error state, and avoids locking the main thread, verifies **AC-6**.
- Contract validation: Shared envelope utilities validate request and response formats cleanly, verifies **AC-7**.

## Build plan

1. Stand up shared worker contracts and message envelopes in src/lib/workers/worker-types.ts, satisfies **AC-7**.
2. Implement the dedicated Web Worker script in src/graph/layout/layout.worker.ts executing graph filtering and Dagre layout, satisfies **AC-1**, **AC-2**.
3. Create the singleton layoutWorkerClient in src/graph/layout/layout-worker-client.ts with busy worker termination, request tracking, 5000ms timeout guard, and jsdom synchronous fallback, satisfies **AC-3**, **AC-5**, **AC-6**.
4. Extend useGraphStore in src/stores/graph-store.ts with layout calculation status and duration metrics, satisfies **AC-4**.
5. Build the useAsyncGraphLayout custom hook in src/hooks/use-async-graph-layout.ts with 50ms input debouncing and unmount guards, satisfies **AC-3**, **AC-4**.
6. Integrate useAsyncGraphLayout into src/components/canvas/architecture-canvas.tsx, replacing synchronous layout useMemo and adding the toolbar progress indicator, satisfies **AC-4**, **AC-8**.
7. Add comprehensive unit and integration tests covering the worker client, busy termination, synchronous test fallback, and canvas integration, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-5**, **AC-6**.

## Migration plan

**Strategy**: Strangler pattern with automatic test fallback.
**Phases**:
1. Stand up worker utilities, worker script, and worker client with test fallback built in.
2. Wire the custom hook and canvas component to consume the worker client.
3. Validate parity between worker results and synchronous layout across the test suite.
**Rollback**: If runtime worker issues occur, setting a fallback condition immediately routes calculations through the existing synchronous layout path without code changes.
**Risks**: Worker module bundling differences between development and production builds, mitigated by standard Next.js ESM worker instantiation and automated build checks.

## Consequences

**Positive**:
- Offloads heavy CPU graph filtering and Dagre coordinate calculations from the browser main thread.
- Prevents UI freezing, maintaining smooth 60 FPS interactions on repositories with hundreds of nodes.
- Eliminates queued calculation delays during rapid filter toggling via busy worker termination.
- Establishes a standard Web Worker communication infrastructure ready for future client side AST parsing or archive decompression tasks.

**Negative / tradeoffs**:
- Message passing introduces a slight structured clone serialization overhead (typically 1 to 3 milliseconds for typical graph sizes).
- Asynchronous layout arrival requires UI state management to display progress indicators and prevent visual layout flicker.

**Neutral**:
- Automated test suites (jsdom) transparently use the synchronous fallback path without requiring complex browser thread emulation.

## Follow-up

- [ ] Add performance benchmark dashboard or console telemetry tracking average layout computation times across repository sizes.
- [ ] Investigate client side zip and tar archive decompression worker when local file upload feature is scheduled.
