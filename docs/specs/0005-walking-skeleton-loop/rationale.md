# 0005. Walking Skeleton Loop: Rationale

## Context

Codebase Visualizer aims to help engineers understand unfamiliar GitHub repositories by transforming raw source files into an interactive visual dependency graph paired with source code inspection. Proving this concept requires validating every layer of the architecture early: user input handling, external repository fetching, syntax tree parsing, dependency resolution, graph layout calculation, interactive canvas rendering, and source code display.

Building individual subsystems in isolation without connecting them end to end creates significant integration risk. A parser built without an actual canvas consumer might produce graph representations that are too dense or slow to lay out. Similarly, a canvas built purely on synthetic mock data might make assumptions about node hierarchy or source file relationships that real repositories violate.

Furthermore, several technical constraints govern this problem space. Public GitHub repositories vary widely in scale, from small utility packages to massive monorepos containing thousands of files. Unauthenticated GitHub API calls face strict rate limits of 60 requests per hour per IP address. Fetching file contents individually via separate blob API requests guarantees immediate rate limit failure on any repository exceeding 60 files. In addition, serverless route handlers have memory limits and execution timeouts that prohibit heavy temporary disk operations or indefinite processing loops. Finally, rendering interactive graphs and syntax highlighted code must preserve smooth 60 frames per second responsiveness on the client without UI freezing.

Establishing a thin, working walking skeleton loop based on a single request archive download immediately proves that all parts work harmoniously together while enforcing safe defensive boundaries before later slices introduce deeper features like bidirectional symbol navigation or semantic queries.

## Options considered

### Option 1: Single request tarball archive streaming with in memory extraction, client Dagre layout, and dynamic Monaco Editor

This approach implements a Next.js route handler that streams ingestion progress through Server Sent Events, downloads the repository in a single compressed tarball request via `GET /repos/{owner}/{repo}/tarball/{branch}`, unpacks the stream in memory, extracts `tsconfig.json` for path aliases, and selects up to 100 TypeScript and JavaScript source files prioritizing shallowest directory depth. It extracts import relationships using `ts-morph` in a virtual file system, generates external module stubs for boundary imports, and returns a canonical `CodebaseGraph` along with file contents. The browser calculates layered coordinates using a Dagre layout utility with fixed card dimensions (220px by 72px), renders nodes on React Flow, and synchronizes selection to a dynamically mounted Monaco Editor.

**Pros**:
- Proves the complete vertical thread from user input to interactive code inspection.
- Downloads the entire codebase in a single HTTP request, consuming exactly 1 rate limit point instead of dozens.
- Streaming progress events keep users informed during multi step repository ingestion.
- Zero server disk writes eliminate temporary directory cleanup hazards.
- Dagre layout on the client provides clean, readable top to bottom hierarchical arrangements.
- Decoupled client store keeps graph state cleanly separated from layout persistence.

**Cons**:
- Enforces an initial defensive cap of 100 source files to protect serverless memory.
- In memory archive unpacking requires streaming decompression dependencies (`tar-stream`).
- Dynamic import of Monaco Editor adds a small client bundle overhead on first load.

### Option 2: Individual file blob fetching via GitHub git trees and blob API

This option enumerates file paths through the GitHub git tree endpoint and fetches each file individually using the `/git/blobs/{sha}` endpoint.

**Pros**:
- Simple sequential fetch loop without archive decompression libraries.

**Cons**:
- Consumes one rate limit point per file downloaded, guaranteeing immediate 403 Rate Limited errors on unauthenticated users for repositories with more than 60 files.
- Incurring up to 100 sequential or batched network round trips risks hitting serverless execution timeouts.
- Does not easily permit extracting auxiliary configuration like `tsconfig.json` without extra rate limit costs.

### Option 3: Full client side ingestion and in browser Web Worker AST parsing

This option runs all repository ingestion, GitHub REST calls, and AST parsing directly inside the browser using a Web Worker.

**Pros**:
- Eliminates server route handler workload and hosting costs completely.
- Bypasses serverless execution timeouts.

**Cons**:
- Browser clients face severe GitHub API CORS restrictions and shared IP rate limits.
- Bundling `ts-morph` and the full TypeScript compiler into a browser client payload incurs massive bundle overhead (over 10MB of JavaScript).
- Exposes user GitHub tokens to browser extensions and client side inspection.

## Decision

We choose Option 1: Single request tarball archive streaming with in memory extraction, client Dagre layout, and dynamic Monaco Editor.

## Rationale

Option 1 provides the best balance between architectural safety, operational simplicity, and user experience.

By downloading the repository via GitHub's single archive tarball endpoint, we consume only 1 rate limit point. This completely eliminates the severe rate limit exhaustion risk inherent in multi blob fetching while preventing serverless timeouts. Running `ts-morph` exclusively within an in memory virtual file system ensures fast syntax parsing without touching server disk storage or leaving orphaned temporary directories.

Prioritizing the 100 shallowest source files ensures that root configurations and core source modules in `src/` are parsed first, while generating `ExternalModuleNode` stubs guarantees that imports referencing files beyond the cap still connect cleanly in the graph. Calculating layered node positions on the client using Dagre with explicit card dimensions avoids costly server rendering while allowing instant topological layout that reflects import dependencies. Pairing React Flow with dynamically imported Monaco Editor in the existing split layout proves the core value proposition: clicking an architectural node immediately reveals the exact implementation code.
