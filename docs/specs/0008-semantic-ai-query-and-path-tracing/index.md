# 0008. Semantic AI Query and Path Tracing

**Date**: 2026-09-05
**Status**: Accepted

## Summary

This specification introduces natural language architecture questions and visual path tracing across the codebase graph. Users can ask questions about module responsibilities, architectural layers, or connection paths between components. The system combines a zero cost demo mode with bring your own key credentials stored in encrypted cookies, supporting interchangeable Gemini, OpenAI, and Claude providers via Vercel AI SDK tool calling. Validated dependency paths light up on the React Flow canvas with glowing accent edges, while interactive citation chips jump directly to source lines in the Monaco code viewer.

## Context

Reasoning and options: see [rationale.md](rationale.md).

## Requirements

**User stories**:
- As an engineer exploring an unfamiliar repository, I want to ask natural language questions about how modules interact so that I can understand architectural boundaries without reading every source file manually.
- As a technical lead evaluating system flow, I want the visual graph to trace the exact dependency path between two services so that I can verify call chains and spot unwanted coupling.
- As a developer testing the visualizer, I want a zero cost demo mode that demonstrates query and path tracing capabilities immediately without requiring an API key.

**Acceptance criteria**:
- **AC-1**: Users can submit natural language architecture questions through the Trace tab in the right hand panel, viewing real time streaming text responses with conversation thread history preserved in session storage across page reloads.
- **AC-2**: When operating without user credentials, the system runs in demo mode with clickable suggested prompt pills and pre generated architectural answers, ensuring zero cost and zero risk of abuse.
- **AC-3**: In standard mode, the system accepts user API keys stored in an encrypted HTTP only cookie, routing requests through a provider agnostic interface with Gemini Flash as the default and interchangeable support for OpenAI and Claude.
- **AC-4**: Every path sequence returned by the model undergoes deterministic breadth first search validation against the canonical `CodebaseGraph`; if an edge sequence cannot be verified, an informative warning badge displays while keeping the text explanation.
- **AC-5**: Validated path traces highlight connected edges on the React Flow canvas using glowing accent stroke colors and animated arrows, while dimming unrelated nodes.
- **AC-6**: Interactive citation chips embedded in AI responses display file and symbol coordinates, executing dual action navigation that loads the file into Monaco editor if not currently active, scrolls to the declaration line, and centers the canvas camera on the target node.
- **AC-7**: When no valid path connects two requested modules, the system returns an explanation of architectural separation, computes the closest common directory ancestor deterministically, and highlights both isolated nodes on the canvas.
- **AC-8**: No server side credentials. Live queries run only with the caller's own key for the selected provider, taken from their encrypted cookie. A missing key, a key saved for a different provider, or a tampered or expired cookie returns 401, and the server never substitutes a key of its own.
- **AC-9**: Credential endpoints accept only same origin JSON requests, so another site cannot plant a key, and they fail closed: without `AI_COOKIE_SECRET` no cookie is created or read.
- **AC-10**: Bounded and attributable requests. Request bodies are read with a byte cap and validated against a schema, credential endpoints require a JSON content type, and rate limits key on an address the client cannot choose.

## Decision

**Chosen option**: Provider agnostic route handler proxy with Vercel AI SDK tool calling, zero cost demo mode, and encrypted cookie BYOK storage.

We implement an `AIProvider` interface in the Next.js backend with three concrete implementations (Google Gemini Flash as default, OpenAI GPT, and Anthropic Claude). A zero cost demo mode delivers canned traces for demonstration repositories without live model invocations. Standard queries forward credentials via encrypted HTTP only cookies, validate model generated path steps using deterministic breadth first graph traversal, and synchronize visual canvas highlights with Monaco editor code coordinates.

**Implementation skills**: `vercel-labs/skills` (`vercel-labs/skills`, `~/.gemini/config/plugins/vercel-labs/skills/`) · `gemini-api-dev` (`google-gemini/gemini-api`, `~/.gemini/config/plugins/gemini-api/skills/gemini-api-dev/`)

## Feature design

**Data model sketch**:
- `AiQueryThread`: Conversation thread bound to a repository (`thread:{repoFullName}`). Fields: `id` (string), `repositoryFullName` (string), `messages` (array of `AiQueryMessage`), `activeTraceId` (string or null), `createdAt` (ISO 8601), `updatedAt` (ISO 8601). Persisted in browser `sessionStorage` under `cv:thread:{repoFullName}`.
- `AiQueryMessage`: Single query prompt or model response turn (`msg:{timestamp}_{random}`). Fields: `id` (string), `threadId` (string), `role` (`"user"` | `"assistant"` | `"system"`), `content` (string), `status` (`"idle"` | `"streaming"` | `"complete"` | `"error"`), `errorMessage` (string or null), `pathTrace` (`PathTrace` or null), `citations` (array of `CitationRef`), `isPathVerified` (boolean), `createdAt` (ISO 8601).
- `CitationRef`: Coordinate link tying prose to code (`cite:{fileId}_{line}`). Fields: `id` (string), `fileId` (string), `symbolId` (string or null), `line` (number or null), `column` (number or null), `label` (string), `snippet` (string or null).
- `PathTrace`: Reused canonical domain entity from `src/entities/path-trace.ts`. Fields: `id` (`trace:{sourceNodeId}->{targetNodeId}`), `sourceNodeId` (string), `targetNodeId` (string), `stepNodeIds` (array of strings), `stepEdgeIds` (array of strings), `hopCount` (number), `rationale` (string or null), `createdAt` (ISO 8601).
- `AiProviderConfig`: Settings entity for active provider selection (`settings:ai_provider`). Fields: `provider` (`"gemini"` | `"openai"` | `"claude"`), `model` (string), `isDemoMode` (boolean), `tokenBudget` (number: 40000 for Gemini, 20000 for OpenAI and Claude).
- `ActiveTraceState`: Reactive Zustand slice in `src/stores/graph-store.ts`. Fields: `activeTrace` (`PathTrace` or null), `activeStepIndex` (number or null), `highlightedNodeIds` (read only string array), `highlightedEdgeIds` (read only string array).

**State transitions**:
- Query lifecycle: `idle` → `validating` → `streaming` → `complete` | `error`.
- On user stop button: `streaming` → `idle` (active controller aborts network connection, keeping partial text content intact).
- On new repository load: `activeTrace` resets to `null`, active thread switches to matching repository cache.

**Model Output and Tool Calling Protocol**:
The backend utilizes Vercel AI SDK `streamText` equipped with two structured tools:
1. `recordPathTrace`: arguments `{ sourceNodeId: string, targetNodeId: string, rationale?: string }`. Triggers server side BFS validation (`findDependencyPath`) before emitting `event: trace`.
2. `recordCitations`: arguments `{ citations: Array<{ fileId: string, symbolId?: string, line?: number, label: string, snippet?: string }> }`. Emits typed `event: citations` event chunk.

**Context Assembly and Prioritization Algorithm**:
1. Prompt Token Scan: Scan user prompt for keywords matching known file names or symbol identifiers in `graph.files` and `graph.symbols`. Force include matching file declarations.
2. Entrypoint and Hub Priority: Include root entrypoints (`src/index.ts`, `src/app/page.tsx`, `src/main.ts`) and top 10 highest fan in modules.
3. Layer Outline: Format remaining files as compact single line outlines showing file path, dominant layer, and exported symbol names.
4. Budget Enforcement: Truncate lower priority outline files when approaching provider token limit (40000 tokens for Gemini, 20000 for OpenAI and Claude).

**Deterministic Common Ancestor Calculation**:
When `findDependencyPath` yields no connection between `fileA` and `fileB`, the system calls `findClosestCommonAncestor(fileA, fileB)` in `src/graph/path-validation.ts`. This utility splits normalized relative file paths into folder segments, determines the longest common prefix directory, and suggests this shared folder as the architectural junction point.

**API surface**:
| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/api/ai/query` | POST | `repository`: object, `messages`: array, `context`: object, `isDemo`: boolean, `provider`: string | Server Sent Events stream (`event: text`, `event: trace`, `event: citations`, `event: done`) | Encrypted `cv_ai_key` cookie for the requested provider in non demo mode (demo requires none). Same origin only | 400 invalid payload, 401 no key or key saved for another provider, 403 cross site request, 413 body over 10 MB, 429 rate limit exceeded, 500 cookie secret not configured (only when a cookie is sent), 502 provider error |
| `/api/ai/keys` | POST | `provider`: string, `apiKey`: string | `{ success: true, provider }` with HTTP only encrypted cookie | Public. Same origin JSON only | 400 unsupported provider, empty key, or non JSON content type, 403 cross site request, 413 body over 4 KB, 500 cookie secret not configured (no cookie issued) |
| `/api/ai/keys` | DELETE | None | `{ success: true }` clearing cookie | Public. Same origin only | 200 ok, 403 cross site request |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Submit query | User prompt message | Textarea input in Trace tab component |
| Submit query | Repository context | Derived from active `useGraphStore.getState().graph.repository.fullName` |
| Assemble context | Priority candidate files | Extracted by regex token matching against `graph.files` |
| Assemble context | Export signatures and symbol names | Derived from `graph.symbols` where `isExported` is true |
| Assemble context | Architectural layer summary | Derived from `classifyLayerForPath` in `src/graph/layers.ts` |
| Assemble context | Module connectivity metrics | Derived from `buildAdjacencyIndex` in `src/graph/traversal.ts` |
| Stream text | Markdown explanation chunk | Parsed from Server Sent Events `event: text` chunk |
| Validate path | Verified graph edges | Computed by `findDependencyPath` in `src/graph/path-trace.ts` |
| Handle disconnect | Closest common directory | Computed by `findClosestCommonAncestor` in `src/graph/path-validation.ts` |
| Render canvas path | Glowing edge stroke styles | Derived from `activeTrace.stepEdgeIds` in `ArchitectureCanvas` |
| Click citation | Code coordinates in editor | Handled by `navigateToTarget` setting `selectedFileId`, `symbolId`, and `line` |

**Key invariants**:
- Every edge displayed in a visual path trace must exist in the loaded `CodebaseGraph`; if an edge sequence cannot be verified, the UI renders an amber warning banner rather than broken canvas edges.
- User API keys are never written to disk, server databases, or application log files; they remain exclusively in an encrypted HTTP only browser cookie.
- The server holds no LLM key. A live query uses only the caller's key from their `cv_ai_key` cookie, and only for the provider that key was saved for.
- Links in assistant markdown render as links only for `http`, `https`, and `mailto` (`getSafeLinkHref` in `src/components/trace/markdown-message.tsx`); any other scheme, such as `javascript:` or `data:`, renders as plain text.
- Keys sent upstream travel in headers, never in URLs (Gemini uses `x-goog-api-key`), so they stay out of proxy and access logs.
- Demo mode never makes live external network calls to AI providers; it resolves exclusively against local static fixtures.
- Context payloads assembled on the client must not exceed the provider specific token budget (40000 for Gemini, 20000 for OpenAI and Claude).

**Security model**:
- In demo mode, zero external network calls occur, completely removing provider credential exposure and billing abuse.
- In standard mode, credentials pass strictly through an encrypted HTTP only cookie (`cv_ai_key`), preventing malicious client side scripts from reading raw API keys. The cookie is `Secure` in production, `SameSite=Lax`, and lives 30 days.
- Encryption is AES 256 GCM with a random 96 bit IV and a key derived from `AI_COOKIE_SECRET`. The expiry is sealed inside the ciphertext, so a copied value stops working on time even if a client ignores the cookie attribute. The cookie purpose is bound in as additional authenticated data, so an AI key cookie cannot be replayed as a GitHub token cookie. Both use the shared helper in `src/lib/security/cookie-crypto.ts`.
- Fail closed: there is no fallback secret. If `AI_COOKIE_SECRET` is missing, saving a credential returns 500 and issues no cookie, and reading a stored cookie throws. A missing secret while a cookie is present therefore surfaces as a 500, not a 401, so a misconfigured deployment is noticed; only a wrong, tampered, or expired cookie is treated as no credential.
- Cross site protection: `SameSite` does not decide whether a cross site response may cause the browser to store a cookie, so it cannot stop a foreign page from planting a key. `POST` and `DELETE` on `/api/ai/keys` therefore reject a foreign `Origin` or a `Sec-Fetch-Site` other than `same-origin` or `none`, and `POST` requires `Content-Type: application/json` (a cross site HTML form cannot send it). Same origin means the `Origin` host equals the `Host`, `X-Forwarded-Host`, or request URL host (scheme is ignored). A request with neither `Origin` nor `Sec-Fetch-Site` (curl, server to server) is allowed, because it carries no browser cookies.
- Provider binding: `/api/ai/query` uses the decrypted key only when its saved provider equals the requested provider.
- Input bounds: bodies are read with a byte cap that does not trust `Content-Length` (keys 4 KB with `provider` at most 32 and `apiKey` at most 1024 characters, queries 10 MB) and validated with `zod` schemas (at most 100 messages of 100,000 characters, summary at most 200,000 characters).
- Rate limiting on `/api/ai/query` guards against denial of service loops and request cost, allowing up to 30 queries per minute per client in BYOK mode and 10 in demo mode. The client address is the rightmost `X-Forwarded-For` entry, which the nearest trusted proxy appends; leftmost entries are client controlled and never used. If the header is absent the address falls back to `X-Real-IP`, then to one shared `unknown` bucket. This assumes a trusted proxy appends the header; without one the rightmost entry is client controlled, so deploy behind one. Deployments with several proxy hops share the last hop's bucket, which fails safe. Demo and BYOK queries share one bucket per client with different caps, and at most 10,000 clients are tracked (the oldest is dropped first). Counts live in one process and reset on restart, so a hard global limit needs a shared limiter at the platform edge.
- Page level headers and the `Content-Security-Policy` are described in spec 0005.

**Configuration required**:
- `AI_COOKIE_SECRET`: required. A random secret; at least 32 characters is guidance and is not enforced, hashed into the AES 256 key used to encrypt and decrypt the BYOK cookie. There is no development fallback: when it is unset the credential routes fail closed as described above.
- The server reads no LLM provider keys. `GEMINI_API_KEY`, `OPENAI_API_KEY`, and `ANTHROPIC_API_KEY` are ignored, and live mode always needs the user's own key.
- Cookies written before the expiry and purpose binding was added no longer decrypt, so users re enter their key once.

**Critical test scenarios**:
- Happy path: User submits a query asking how file A depends on file B, receiving streaming text and a glowing 3 hop path trace on the canvas, verifies **AC-1**, **AC-4**, **AC-5**.
- Demo mode flow: User clicks a suggested question pill in demo mode without entering an API key, receiving an immediate pre generated architectural summary, verifies **AC-2**.
- Provider switching: User inputs a custom key via the key settings modal, selects Claude, and receives streaming answers through the provider agnostic interface, verifies **AC-3**.
- Hallucination handling: Model proposes an invalid edge, and the system displays an amber warning badge while preserving markdown text, verifies **AC-4**.
- Disconnected modules: User queries the relationship between two independent utility files, and the system reports no dependency path exists while calculating and suggesting the shared directory ancestor, verifies **AC-7**.
- Citation deep linking: User clicks a citation badge pointing to an unopened file, triggering file loading into Monaco, declaration line scroll, and canvas camera centering, verifies **AC-6**.
- No server key: With `GEMINI_API_KEY` set on the server, a live query with no cookie returns 401 `auth_error` and makes no upstream call, verifies **AC-8**.
- Wrong provider: A cookie saved for OpenAI used on a Gemini query returns 401 and makes no upstream call, verifies **AC-8**.
- Cookie planting: A `POST /api/ai/keys` with a foreign `Origin`, a cross site `Sec-Fetch-Site`, or a `text/plain` body sets no cookie, verifies **AC-9**.
- Fail closed: With `AI_COOKIE_SECRET` unset, `POST /api/ai/keys` returns 500 and sets no cookie, verifies **AC-9**.
- Rate limit identity: Rotating the leftmost `X-Forwarded-For` value does not reset the limit, verifies **AC-10**.
- Input bounds: A query body over 10 MB returns 413 and a message list over 100 entries returns 400, verifies **AC-10**.

## Build plan

The build plan follows a Tracer Bullet approach: constructing a thin end to end thread from UI to route handler to canvas highlight first, then deepening provider implementations, context condensation, and credential management.

1. [x] **Active trace state and canvas styling slice**: extend `useGraphStore` with `ActiveTraceState` actions (`setActiveTrace`, `focusTraceStep`, `clearTrace`) and update `ArchitectureCanvas` edge mapping to render glowing accent strokes and directional markers for active trace edge identifiers, satisfies **AC-5**.
2. [x] **Deterministic graph path validation utility**: implement `validateDependencyChain` and `findClosestCommonAncestor` in `src/graph/path-validation.ts` using `findDependencyPath` from `src/graph/path-trace.ts` to construct verified `PathTrace` entities, satisfies **AC-4**, **AC-7**.
3. [x] **Provider agnostic AI service and demo mock**: create the `AIProvider` TypeScript interface and a static demo provider implementation that returns pre generated answers and validated path traces for demo repositories without live API calls, satisfies **AC-2**, **AC-3**.
4. [x] **Server Sent Events route handler and client listener**: build `POST /api/ai/query` streaming multi event SSE (`text`, `trace`, `citations`, `done`, `error`) and implement a client side hook `useAiQueryStream` with `AbortController` cancellation and session storage thread caching, satisfies **AC-1**.
5. [x] **Trace tab workspace panel**: replace the placeholder in `src/app/page.tsx` with an interactive `TracePanel` component featuring query input, suggested prompt pills, conversation thread history, streaming markdown rendering, and hallucination warning badges, satisfies **AC-1**, **AC-2**, **AC-4**.
6. [x] **Dual action citation navigation**: wire interactive citation chips in assistant responses to invoke `navigateToTarget` and `selectNode`, loading unopened files into Monaco editor, highlighting declaration lines, and focusing the React Flow camera, satisfies **AC-6**.
7. [x] **Encrypted cookie credential exchange**: create `/api/ai/keys` endpoint with AES 256 GCM encryption, supporting secure bring your own key persistence in HTTP only cookies, satisfies **AC-3**.
8. [x] **Concrete Gemini, OpenAI, and Claude providers**: integrate the Vercel AI SDK with concrete implementations for Gemini Flash (default), OpenAI GPT, and Anthropic Claude, utilizing `recordPathTrace` and `recordCitations` tool calls, satisfies **AC-3**.
9. [x] **Topology context compressor**: create a client side graph summarizer in `src/graph/context-summary.ts` that prioritizes prompt keywords and entrypoints while enforcing provider specific token budgets, satisfies **AC-1**, **AC-4**.
10. [x] **Security hardening pass**: fail closed cookie secret with sealed expiry and purpose binding (`src/lib/security/cookie-crypto.ts`), same origin and JSON guard, body caps and schemas (`src/lib/security/request.ts`), provider bound cookie keys, removal of server LLM key fallbacks, Gemini key in a header, and rate limiting on the rightmost forwarded address, satisfies **AC-8**, **AC-9**, **AC-10**

## Consequences

**Positive**:
- Users can ask open ended architectural questions and immediately see the corresponding visual paths illuminated on the graph canvas.
- The zero cost demo mode provides an instant, risk free evaluation experience for users without requiring API keys or billing setup.
- The clean `AIProvider` interface allows swapping models and vendors without modifying core canvas or editor components.
- Deterministic graph validation completely prevents model hallucinations from appearing as false edges on the architecture canvas.
- Storing conversation threads in session storage maintains context across page reloads without requiring a remote database.

**Negative / tradeoffs**:
- Storing keys in encrypted cookies requires server side decryption on each streaming request rather than direct browser to provider calls.
- With no server key, there is no keyless live mode for operator testing; demo mode is the only keyless path.
- The rate limiter is per process, so it slows abuse but is not a global cap on several instances.
- Credentials fail closed, so a deployment that forgets `AI_COOKIE_SECRET` cannot save keys until it is set.
- Condensing large repository graphs into token budgets necessarily omits implementation bodies, limiting the model's awareness of internal function logic.

**Neutral**:
- Reuses the existing `PathTrace` schema from `src/entities/path-trace.ts` without modifying canonical serialization versions.
- Adds new dependencies (`ai`, `@ai-sdk/google`, `@ai-sdk/openai`, `@ai-sdk/anthropic`) to `package.json`.

## Follow-up

- [ ] Connect Vercel MCP server in Antigravity settings for deployment and project inspection as requested during tool discovery.
- [ ] Add `vercel-labs/skills` patterns to `.agents/skills/` once network or package installation access is configured.
- [ ] Put a shared rate limit store or a platform edge limit in front of the AI and ingest routes if the app runs on several instances.
- [ ] Consider adding vector embeddings in a future slice if repositories with more than 2,000 files require deeper semantic snippet search.
