# 0009. Client Cache and Ingestion Streaming (Decision Record)

## Context

Codebase Visualizer turns public GitHub repositories into interactive architecture diagrams and side by side code viewers. Generating these maps requires fetching repository tarballs, extracting files in memory, and parsing TypeScript syntax trees with ts-morph into canonical graph structures. While effective, re running this full extraction pipeline on every page reload or repeat visit creates significant friction.

Several forces shape this problem space:

First, network and computation overhead on repeat visits. Parsing even a moderately sized repository (such as 100 to 200 files) takes between 3 to 8 seconds of server CPU time and transfers several megabytes of archive data. For developers exploring the same codebase repeatedly throughout a work day, this latency is frustrating and wastes server compute.

Second, strict GitHub API rate limits. Unauthenticated requests to GitHub are capped at 60 requests per hour per IP address. Downloading a repository archive costs one rate limit point. In shared office environments or university networks where multiple users share an IP address, this limit is exhausted rapidly, blocking exploration.

Third, browser storage capacity and quota restrictions. Browser storage options vary dramatically in capacity. Traditional localStorage and sessionStorage impose a synchronous 5 megabyte string limit per origin. A parsed `CodebaseGraph` with full source file text frequently reaches 10 to 30 megabytes for realistic codebases. Attempting to serialize full repositories into sessionStorage triggers quota exceeded exceptions. IndexedDB provides asynchronous storage scaling up to gigabytes, accommodating multiple complete repositories with full source text.

Fourth, credential security and storage parity. To bypass rate limits, users can provide a GitHub personal access token. Storing raw tokens in client accessible storage (such as localStorage or sessionStorage) exposes credentials to third party browser extensions and cross site scripting attacks. Spec 0008 established the architectural precedent of storing AI provider keys in encrypted httpOnly cookies; GitHub tokens require identical security guarantees.

Fifth, real time streaming and UI responsiveness. Repository ingestion runs through a server sent events pipeline. Emitting fine grained progress updates for every single file or AST node can produce hundreds of events per second on fast machines, causing network buffer bloat and excessive React render cycles that freeze the browser thread.

## Options considered

### Option 1: Browser local storage with client direct GitHub queries

In this model, the client queries GitHub directly from the browser using user credentials and caches parsed graphs inside browser localStorage.

**Pros**:
- Zero server compute required for caching or token proxying.
- Simple client implementation using standard synchronous browser APIs.

**Cons**:
- Browser localStorage imposes a hard 5 megabyte limit, which fails immediately for repositories containing more than a few dozen files.
- Storing personal access tokens in plain text in browser storage exposes credentials to extension scraping and client script injection.
- Exposes user IP directly to client side CORS restrictions on GitHub archive downloads.

### Option 2: Server side Redis caching with session cookies

In this architecture, the Next.js server caches parsed `CodebaseGraph` records and archive tarballs inside an external Redis or Postgres database, identified by repository URL and commit hash.

**Pros**:
- Instantaneous cache hits across different users visiting the same popular repository.
- Eliminates client side storage management and browser quota concerns.

**Cons**:
- Introduces external infrastructure dependencies (Redis cluster or managed database) and ongoing operational hosting costs.
- Requires database maintenance, eviction policies, and server side disk provisioning.
- Conflicts with the project design goal of a lean, self contained architecture running easily on developer laptops and standard container hosts.

### Option 3: Client IndexedDB persistence with commit hash validation, encrypted httpOnly cookie token storage, and throttled server sent events streaming

In this architecture, parsed graphs and source maps are persisted in browser IndexedDB (`codebase_visualizer_cache_v1`). On submission, the Next.js `/api/ingest` route checks the upstream commit hash against the client cached hash via `GET /repos/{owner}/{repo}/commits/{branch}`; if identical, it emits an immediate `cache_hit` SSE event, allowing the client to hydrate directly from IndexedDB without downloading archive bytes. Granular progress updates stream with a 100 millisecond server throttle. User tokens are stored in AES 256 GCM encrypted httpOnly cookies matching the AI key pattern. Storage quota is capped at 10 repositories or 300 megabytes with atomic least recently used pruning.

**Pros**:
- Provides hundreds of megabytes of asynchronous structured storage capacity without third party server infrastructure costs.
- Instant sub 100 millisecond load times for previously analyzed repositories.
- Upstream commit hash validation guarantees that cached graphs never become stale when new commits land on the remote branch.
- Encrypted httpOnly cookie storage eliminates client script token exposure, achieving parity with the existing credential pattern.
- Zero new npm dependencies by utilizing native browser IndexedDB Promise wrappers.

**Cons**:
- Cache is local to the user browser and is not shared across different users.
- Clearing browser site data or using private browsing windows resets the local cache.

## Rationale

We select Option 3: Client IndexedDB persistence with commit hash validation, encrypted httpOnly cookie token storage, and throttled server sent events streaming.

IndexedDB directly resolves the storage capacity bottleneck. Unlike localStorage, IndexedDB supports hundreds of megabytes of structured data asynchronously, easily accommodating 10 complete repositories with full source text (up to 300 megabytes) while maintaining a responsive 60 frames per second UI.

Checking the upstream commit hash in `/api/ingest` via the lightweight commits endpoint strikes the ideal balance between freshness and efficiency. A lightweight GitHub metadata check costs minimal rate limit quota and takes less than 200 milliseconds. When the commit hash matches, the server emits a `cache_hit` event and aborts further network transfer, saving megabytes of archive bandwidth and seconds of parser CPU.

Migrating GitHub personal access tokens from sessionStorage to an encrypted httpOnly cookie (`github_pat`) eliminates architectural drift. Spec 0008 established AES 256 GCM encrypted cookies for BYOK credentials. Applying this exact standard to GitHub tokens keeps credentials out of reach of malicious browser extensions and cross site scripting vectors.

Finally, capping granular progress emissions to at most one update every 100 milliseconds prevents event stream congestion and unnecessary React re rendering loops, ensuring smooth visual progress during extraction.
