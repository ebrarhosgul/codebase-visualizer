# 0012. Web Worker isolation for layout and parsing computations (Rationale)

## Context

Codebase Visualizer renders interactive architectural dependency graphs from repository source files. As repositories grow beyond 100 files and several hundred symbols, graph layout calculation becomes computationally demanding.

Currently, computeDagreLayout runs synchronously on the main browser thread within a useMemo hook inside ArchitectureCanvas. Whenever users toggle an architectural layer, collapse or expand folder groups, or type into the search bar, the main thread synchronously filters the graph entities and runs Dagre hierarchical layout positioning. On repositories with 300 or more nodes, this calculation blocks the browser event loop for 60 to 200 milliseconds. This blocking causes noticeable frame rate drops below 55 FPS, stuttering animations, and unresponsive canvas navigation.

Additionally, while tar extraction and abstract syntax tree parsing currently execute on the server during GitHub repository ingestion, establishing clean worker isolation patterns creates a reusable foundation for future client side parsing of local repository archives.

A robust solution must offload graph layout positioning and filtering from the browser main thread while guaranteeing exact coordinate parity, resilient fallback in non worker test environments, and instant responsiveness without worker queue lag under rapid user interactions.

## Options considered

### Option 1: Fix in place with microtask chunking on the main thread

Break Dagre layout positioning and graph filtering into time sliced chunks using requestIdleCallback or setTimeout generators on the main UI thread.

**Pros**:
- Runs in the same execution context with zero message passing overhead and zero serialization.
- Requires no Web Worker files or bundler configurations.

**Cons**:
- Dagre layout algorithms are tightly coupled iterative graph solvers that cannot be cleanly paused mid calculation without major engine refactoring.
- Time slicing still competes with user input and rendering on the main thread, resulting in longer total calculation times.

### Option 2: Dedicated Web Worker for layout and filtering with busy worker termination and test fallback (Chosen)

Move Dagre hierarchical layout positioning and graph element filtering into a dedicated Web Worker using Next.js native ECMAScript module workers. A singleton client service handles request sequencing, terminates busy workers immediately when superseded by newer requests, and protects against hung calculations with a 5000 millisecond timeout guard. Automated tests in jsdom fall back to synchronous execution.

**Pros**:
- Completely isolates heavy CPU graph computations off the browser main UI thread, preserving 60 FPS interactions.
- Busy worker termination ensures rapid filter changes never queue up behind stale in flight calculations.
- Native Next.js ESM worker support requires zero external dependencies or custom bundler plugins.
- Synchronous fallback is strictly scoped to unsupported headless test environments, avoiding browser freezes if a worker times out.
- Establishes shared worker utilities that prepare the codebase for future client side parsing tasks.

**Cons**:
- Asynchronous coordinate resolution requires careful handling of in flight request superseding and canvas loading states.
- Small structured clone serialization cost (1 to 3 milliseconds) when passing graph objects across thread boundaries.

### Option 3: Offload all client and server workloads including AST parsing to workers immediately

Implement Web Workers for Dagre layout, client side tarball decompression, and Babel or ts-morph AST parsing immediately in a multi worker architecture.

**Pros**:
- Full client side pipeline independence without relying on server ingestion routes.

**Cons**:
- Premature complexity: server side ingestion route /api/ingest already handles tar decompression and ts-morph AST parsing with streaming Server-Sent Events efficiently.
- ts-morph has heavy Node.js dependencies that require substantial virtual file system shims to run in browser Web Workers.
- Diverts effort from the immediate measured user interface bottleneck, which is canvas Dagre layout computation.

## Rationale

Option 2 is chosen because it directly eliminates the primary measured performance bottleneck: synchronous Dagre layout computation on the browser main UI thread. Moving Dagre calculations into a dedicated Web Worker keeps user interactions, panning, and zooming fluid during repository loading and filter changes.

Terminating busy workers on newer incoming requests prevents calculation backlogs when users rapidly adjust filters. Scoping the synchronous fallback strictly to test environments where window.Worker is undefined guarantees that if a worker ever times out in production, the main thread will never freeze.

Native Next.js ESM worker instantiation using new Worker(new URL(...), import.meta.url) provides a clean implementation without adding external libraries like Comlink. Keeping server ingestion in place while structuring shared worker utilities in src/lib/workers/ maintains a clear boundary and prepares the codebase for future client side archive parsing without introducing premature complexity today.
