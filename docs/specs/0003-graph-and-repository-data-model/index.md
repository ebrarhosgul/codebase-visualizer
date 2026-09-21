# 0003. Graph and Repository Data Model

**Date**: 2026-09-02
**Status**: Accepted

## Summary

This specification establishes the canonical domain data model for Codebase Visualizer. It defines immutable data structures for repositories, file trees, abstract syntax tree symbols, dependency relationships, and query path traces. Decoupling this domain model from presentation libraries guarantees type safe traversal, deterministic permalinks, and reliable client persistence.

## Requirements

**User stories**:
- As an engineer exploring a repository, I want a structured graph of files and code symbols so that I can understand architectural connections at both macro and micro levels.
- As a developer navigating code, I want deterministic identifiers for every file and symbol so that browser links, search queries, and editor views point reliably to the exact declaration.
- As a frontend client, I want an efficient and cycle safe graph structure so that rendering layouts, filtering modules, and tracing paths never freeze the browser thread.

**Acceptance criteria**:
- **AC-1**: Canonical entity schemas. The domain model defines strictly typed schemas for `Repository`, `DirectoryNode`, `FileNode`, `SymbolNode`, `ExternalModuleNode`, `GraphEdge`, and `PathTrace` with runtime validation through Zod schemas and inferred TypeScript types.
- **AC-2**: Deterministic identity scheme. Every node and edge generates a deterministic identifier derived from normalized repository paths, symbol scopes (with line and column anchors for anonymous declarations), and connection tuples, ensuring stable permalinks and idempotent lookups.
- **AC-3**: Multi level code hierarchy. The model explicitly represents containment relationships linking repositories to directories, directories to child directories and files, and files to their declared code symbols.
- **AC-4**: Typed edge taxonomy and aggregation. The graph edge schema classifies relationships into typed kinds (`file_import`, `re_export`, `call`, `type_reference`, `heritage`, `contains`), with support for internal nodes and external package identifiers (`ext:{packageName}`). Multiple identical calls aggregate into a single edge with incremented weight while preserving call site locations in edge metadata.
- **AC-5**: Source position and range precision. Each symbol and file records zero indexed character offsets (`startOffset`, `endOffset`) and 1 indexed line and column coordinates (`startLine`, `startColumn`, `endLine`, `endColumn`), enabling direct mapping to Monaco Editor ranges and URL line anchors.
- **AC-6**: Cycle safe traversal. Graph traversal, filtering, and path tracing utilities navigate directed graphs containing circular dependencies safely by maintaining visited identity sets without infinite loops or stack overflow errors.
- **AC-7**: Serialization and schema versioning. The complete `CodebaseGraph` serializes into a versioned document (`schemaVersion: 1`), enabling fast persistence in IndexedDB and automatic cache eviction on schema mismatch.
- **AC-8**: Decoupled React Flow projection. A pure transformation adapter converts canonical `CodebaseGraph` entities into React Flow nodes and edges based on explicit `GraphScope` and `FilterOptions` without mutating or polluting the underlying domain model.

## Decision

**Chosen option**: Option 1: Decoupled canonical domain model with Zod runtime schemas and pure projection adapters.

We choose a standalone canonical domain model representing repositories, directory hierarchies, file modules, code symbols, external package references, typed dependency edges, and query paths. All structures are validated using Zod schemas with inferred TypeScript types. The domain model remains completely decoupled from React Flow, using pure adapter functions to project graph data into presentation nodes and edges on demand.

## Rationale

Reasoning, options considered, and forces: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**:

```typescript
export interface SourceLocation {
  readonly startLine: number;
  readonly startColumn: number;
  readonly endLine: number;
  readonly endColumn: number;
  readonly startOffset: number;
  readonly endOffset: number;
}

export interface Repository {
  readonly id: string; // repo:{owner}/{name}
  readonly owner: string;
  readonly name: string;
  readonly fullName: string;
  readonly defaultBranch: string;
  readonly commitSha: string;
  readonly analyzedAt: string; // ISO 8601 string
  readonly totalFiles: number;
  readonly totalSymbols: number;
  readonly languages: Record<string, number>;
  readonly schemaVersion: number;
}

export interface DirectoryNode {
  readonly id: string; // dir:{path}
  readonly path: string;
  readonly name: string;
  readonly parentDirId: string | null;
  readonly childDirIds: readonly string[];
  readonly childFileIds: readonly string[];
}

export interface FileNode {
  readonly id: string; // file:{path}
  readonly path: string;
  readonly name: string;
  readonly extension: string;
  readonly language: string;
  readonly sizeBytes: number;
  readonly lineCount: number;
  readonly directoryId: string;
  readonly symbolIds: readonly string[];
  readonly importIds: readonly string[];
  readonly exportIds: readonly string[];
  readonly parseError?: string;
}

export type SymbolKind =
  | 'function'
  | 'method'
  | 'class'
  | 'interface'
  | 'type_alias'
  | 'variable'
  | 'enum';

export type SymbolVisibility = 'public' | 'protected' | 'private';

export interface SymbolNode {
  // Deterministic identifier pattern: symbol:{filePath}#{symbolScopedName}
  // Named declarations use their identifier: symbol:src/auth/service.ts#loginUser
  // Default exports without name: symbol:src/app.tsx#default
  // Nested anonymous functions use coordinate anchors: symbol:src/utils.ts#format$anon@L42C12
  readonly id: string;
  readonly fileId: string;
  readonly parentSymbolId: string | null;
  readonly name: string;
  readonly kind: SymbolKind;
  readonly range: SourceLocation;
  readonly selectionRange: SourceLocation;
  readonly isExported: boolean;
  readonly isDefaultExport: boolean;
  readonly signature: string;
  readonly documentation: string | null;
  readonly visibility: SymbolVisibility;
  readonly childSymbolIds: readonly string[];
}

export interface ExternalModuleNode {
  readonly id: string; // ext:{packageName}, e.g. ext:react or ext:next/server
  readonly name: string;
  readonly isExternal: true;
}

export type EdgeKind =
  | 'file_import'
  | 're_export'
  | 'call'
  | 'type_reference'
  | 'heritage'
  | 'contains';

export interface EdgeMetadata {
  readonly callSites?: readonly SourceLocation[];
  readonly importSpecifiers?: readonly string[];
  readonly isDynamicImport?: boolean;
}

export interface GraphEdge {
  // Deterministic identifier pattern: edge:{sourceId}->{targetId}:{kind}
  readonly id: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly kind: EdgeKind;
  readonly weight: number; // Increment count for repeated calls or references
  readonly isExternal: boolean;
  readonly metadata?: EdgeMetadata;
}

export interface PathTrace {
  readonly id: string; // trace:{uuid}
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
  readonly stepNodeIds: readonly string[];
  readonly stepEdgeIds: readonly string[];
  readonly hopCount: number;
  readonly rationale: string | null;
  readonly createdAt: string;
}

export interface GraphScope {
  readonly granularity: 'directories' | 'files' | 'symbols' | 'all';
  readonly rootDirectoryPath?: string;
  readonly includeExternal: boolean;
  readonly depthLimit?: number;
}

export interface FilterOptions {
  readonly scope: GraphScope;
  readonly selectedNodeIds?: readonly string[];
  readonly enabledEdgeKinds?: readonly EdgeKind[];
  readonly searchQuery?: string;
}

export interface CodebaseGraph {
  readonly schemaVersion: number;
  readonly repository: Repository;
  readonly directories: Record<string, DirectoryNode>;
  readonly files: Record<string, FileNode>;
  readonly symbols: Record<string, SymbolNode>;
  readonly externalModules: Record<string, ExternalModuleNode>;
  readonly edges: Record<string, GraphEdge>;
}
```

**State transitions**:

Repository graph processing is managed in the client Zustand store with an `AbortController` signal to support clean cancellation when switching repositories:
- `idle`: No repository loaded.
- `fetching`: Pulling repository tree and contents from GitHub. Can be aborted via cancel action.
- `parsing`: Building AST structures through ts-morph and generating domain entities. Can be aborted.
- `ready`: Graph populated, validated, and cached in IndexedDB.
- `error`: Ingestion or parsing failed; error displayed with recovery option.

**API surface**:

| Function or Module | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|
| `parseRepositoryGraph` | `files: VirtualSourceFile[]`, `repoMeta: RepoMeta`, `signal?: AbortSignal` | `CodebaseGraph` | Public | Invalid path format, parse limit exceeded, operation aborted |
| `toReactFlowElements` | `graph: CodebaseGraph`, `options: FilterOptions` | `{ nodes: Node[], edges: Edge[] }` | Public | Missing root node, invalid filter criteria |
| `findDependencyPath` | `graph: CodebaseGraph`, `sourceId: string`, `targetId: string` | `PathTrace \| null` | Public | Source or target node not found |
| `filterGraphByScope` | `graph: CodebaseGraph`, `scope: GraphScope` | `CodebaseGraph` | Public | Empty selection scope |
| `serializeCodebaseGraph`| `graph: CodebaseGraph` | `string` (JSON) | Public | Serialization size limit exceeded |
| `deserializeCodebaseGraph`| `raw: unknown` | `Result<CodebaseGraph, ValidationError>` | Public | Schema version mismatch, invalid entity payload |

**Value sourcing**:

| Action | Value produced or displayed | Source |
|---|---|---|
| Ingest and parse repository | Repository summary metadata | GitHub repository API response and local file scan |
| Ingest and parse repository | File and directory hierarchy | Repository file tree structure and path segmentation |
| Traverse AST with ts-morph | Symbol node declarations and signatures | ts-morph SourceFile AST node inspection |
| Traverse AST with ts-morph | Symbol source location and offsets | ts-morph getStart, getEnd, and getStartLinePos queries |
| Resolve module imports | File import and re export edges | ts-morph ImportDeclaration and ExportDeclaration statements |
| Resolve call expressions | Function and method call edges | ts-morph CallExpression symbol definitions and references |
| Resolve external packages | External module node records | Import declarations targeting non relative package specifiers |
| Project graph to React Flow | React Flow visual nodes and edges | Pure transformation adapter over canonical CodebaseGraph |
| Trace path between symbols | Ordered path trace sequence and hop count | Breadth first search over directed CodebaseGraph edges |
| Store and restore session | Serialized cached graph | Client IndexedDB storage keyed by repo and commit SHA |

**Key invariants**:
- Deterministic identifiers: Two parse runs of the exact same repository files must generate identical node and edge identifiers.
- Anonymous anchor determinism: Anonymous symbols incorporate their line and column position (`anon@L{line}C{col}`) to prevent collision.
- Edge aggregation: Identical directed connections aggregate into one edge with incremented weight, recording individual source locations in `metadata.callSites`.
- External modules: Third party dependencies are tracked explicitly in `externalModules` with identifiers formatted as `ext:{packageName}`.
- Immutability: All entities and graph maps use `readonly` properties; graph updates yield fresh instances rather than mutating in place.
- Cycle tolerance: Traversal algorithms must maintain a visited `Set<string>` to guarantee termination in the presence of circular module imports or mutual function calls.
- Schema version integrity: Serialized graphs must declare `schemaVersion: 1`. Cache reads failing schema validation must be evicted automatically rather than throwing runtime exceptions.
- Defensive file boundary: Ingestion limits total parsed source files to 500 to protect browser memory and serverless execution quotas.

**Security model**:
- All operations analyze public code client side or within serverless execution handlers.
- No repository source code or tokens are stored on external application servers.
- A GitHub personal access token comes only from the user. It is kept in an encrypted httpOnly cookie (spec 0009) and is never logged. The server holds no GitHub token of its own, so anonymous requests reach GitHub anonymously.

**Configuration required**:
- None for the data model. The server reads no GitHub credential from its environment. Cookie encryption uses `AI_COOKIE_SECRET`, or `COOKIE_ENCRYPTION_KEY` for the GitHub token cookie when that is set (specs 0008 and 0009).

**Critical test scenarios**:
- Happy path: Parsing a TypeScript repository generates validated `CodebaseGraph` entities with correct directory, file, symbol, external module, and edge records, verifies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-5**.
- Circular imports failure case: Traversal and path finding utilities encounter circular imports (module A imports module B which imports module A) and resolve paths safely without infinite recursion, verifies **AC-6**.
- Schema mismatch and serialization: Deserializing a graph payload with an outdated `schemaVersion` returns an invalid version error and initiates cache eviction, verifies **AC-7**.
- React Flow projection: Projecting a `CodebaseGraph` into React Flow elements creates valid visual nodes with coordinates and styled edges based on `GraphScope` without mutating canonical domain entities, verifies **AC-8**.

## Build plan

Ordered tasks following the Tracer Bullet delivery approach:

1. [x] Create source location schemas, repository entity types, and external module models (`src/entities/source-location.ts`, `src/entities/repository.ts`, `src/entities/external.ts`), satisfies **AC-1**, **AC-2**, **AC-4**, **AC-5**
2. [x] Define directory, file, and symbol node schemas with deterministic id and anonymous anchor helpers (`src/entities/directory.ts`, `src/entities/file.ts`, `src/entities/symbol.ts`), satisfies **AC-1**, **AC-2**, **AC-3**, **AC-5**
3. [x] Implement edge taxonomy, aggregation logic, and call site metadata tracking (`src/entities/edge.ts`), satisfies **AC-2**, **AC-4**
4. [x] Build canonical root graph container, serialization helpers, and schema version guards (`src/entities/codebase-graph.ts`, `src/entities/serialization.ts`), satisfies **AC-1**, **AC-7**
5. [x] Construct graph traversal utilities and cycle safe path tracing algorithms (`src/graph/traversal.ts`, `src/graph/path-trace.ts`), satisfies **AC-6**
6. [x] Build pure transformation adapter projecting `CodebaseGraph` into React Flow nodes and edges using `GraphScope` and `FilterOptions` (`src/graph/adapters/react-flow-adapter.ts`), satisfies **AC-8**
7. [x] Implement unit test suite verifying schema validation, deterministic identifiers, edge aggregation, circular dependency navigation, and serialization round trips (`src/entities/__tests__/`), satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-6**, **AC-7**, **AC-8**

## Consequences

**Positive**:
- Pure domain models prevent tight coupling to UI visualization libraries, allowing React Flow upgrades or alternative renderers without touching business logic.
- Deterministic identifiers ensure bookmarkable URLs and stable deep linking between graph elements and Monaco Editor source lines.
- Explicit external module nodes and edge aggregation keep graph complexity manageable without losing granular call site ranges.
- Zod validation guarantees robust boundary checking when reading from network streams or browser IndexedDB cache.
- Explicit cycle safety prevents UI freezes when exploring complex repositories with circular dependencies.

**Negative / tradeoffs**:
- Projecting the canonical domain graph into React Flow nodes creates an additional memory allocation during rendering, requiring efficient memoization in Zustand.
- Storing both line and column spans alongside character offsets slightly increases serialized graph document size.

**Neutral**:
- Upgrading the domain schema in future slices will require incrementing `schemaVersion` to trigger client cache invalidation.

## Follow-up

- [ ] Connect the ts-morph AST parser to emit these canonical domain entities during Slice 1.
- [ ] Wire IndexedDB persistence using `idb-keyval` to cache serialized `CodebaseGraph` documents during Slice 1.
- [ ] Create visual clustering adapters for directory containers in the React Flow canvas during Slice 3.
