# Rationale: Graph and Repository Data Model

**Date**: 2026-09-02

## Context

Codebase Visualizer turns public GitHub repositories into interactive visual architecture diagrams. To enable seamless exploration, the application must ingest source code, parse syntax structures, render interactive graph canvases, and synchronize selections with source code viewers.

Without a well defined domain model, code analysis logic becomes tightly coupled to visualization components. Direct reliance on React Flow node formats pollutes AST traversal with canvas coordinates and presentation state. Furthermore, navigation features such as deep linking, symbol search, and AI path tracing require stable, deterministic identifiers that do not change across recomputations.

Browser execution constraints demand high memory efficiency. Parsing large codebases can quickly exceed available heap limits if duplicate graph representations are retained. The data model must support defensive file limits (capped at 500 files per specification 0001), fast client caching in IndexedDB, and safe traversal across circular module references without freezing the main thread.

## Options considered

### Option 1: Decoupled canonical domain model with Zod schemas and pure projection adapters

Define an independent, immutable domain graph using pure TypeScript interfaces and Zod validation schemas. Graph entities (repositories, directories, files, symbols, edges) contain purely domain metadata, source ranges, and relationship identifiers. React Flow presentation elements are generated on demand via pure adapter functions.

**Pros**:
- Clean separation of concerns keeps business logic independent of UI canvas libraries.
- Deterministic identifiers support durable URL sharing and idempotent caching.
- Zod validation guarantees data integrity when reading serialized graphs from IndexedDB.
- Enables future alternative projections (such as text summaries, 3D visualizations, or headless CLI tools) without changing domain models.

**Cons**:
- Requires an explicit projection step to produce React Flow nodes and edges, incurring a small memory allocation during rendering.

### Option 2: Direct React Flow node and edge extensions

Store domain metadata directly inside React Flow `Node.data` and `Edge.data` objects during AST traversal, bypassing a separate domain layer.

**Pros**:
- Eliminates transformation overhead between domain models and canvas elements.
- Simpler initial implementation with fewer files and interfaces.

**Cons**:
- Tightly couples AST parsing and business logic to the `@xyflow/react` component library.
- Makes headless testing, serialization, and background Web Worker calculations dependent on UI types.
- Difficult to evolve or replace the visualization layer in future project phases.

### Option 3: Relational normalized graph database schema in IndexedDB

Store repository entities across multiple normalized IndexedDB object stores (separate tables for repositories, files, symbols, and edges) and query them relationally using Dexie or raw IDB transactions.

**Pros**:
- Enables partial updates and granular queries for individual symbols or files.
- Avoids serializing the full graph document into a single JSON payload.

**Cons**:
- Substantially higher transaction and query overhead when loading a repository into memory for graph layout.
- Significantly increases code complexity for caching and cache invalidation.
- Unnecessary for the project defensive ceiling of 500 files, where whole document serialization completes in milliseconds.

## Rationale

We choose Option 1: Decoupled canonical domain model with Zod schemas and pure projection adapters.

Decoupling the domain model from UI presentation guarantees architectural resilience. The core domain representing codebases, syntax symbols, and dependency edges remains pure and easily testable in Vitest without requiring DOM mocks or React component trees.

Deterministic identifiers derived from file paths and symbol names (`symbol:src/auth/service.ts#loginUser`) provide reliable permalinks, ensuring that sharing an architecture URL opens the exact node and source code line across different browser sessions.

Using Zod schemas ensures robust runtime validation at the edges of the system, particularly when reading cached graph payloads from IndexedDB or receiving streaming events from server route handlers. If the schema evolves in future iterations, version checking immediately invalidates outdated cached payloads, preventing silent deserialization errors.
