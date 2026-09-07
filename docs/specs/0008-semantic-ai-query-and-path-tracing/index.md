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
| `/api/ai/query` | POST | `repository`: object, `messages`: array, `context`: object, `isDemo`: boolean, `provider`: string | Server Sent Events stream (`event: text`, `event: trace`, `event: citations`, `event: done`) | Optional encrypted cookie for BYOK (public demo requires none) | 400 invalid payload, 401 missing key in non demo mode, 429 rate limit exceeded, 502 provider error |
| `/api/ai/keys` | POST | `provider`: string, `apiKey`: string | `{ success: true }` with HTTP only encrypted cookie | Public | 400 unsupported provider or empty key |
| `/api/ai/keys` | DELETE | None | `{ success: true }` clearing cookie | Public | 200 ok |

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
- Demo mode never makes live external network calls to AI providers; it resolves exclusively against local static fixtures.
- Context payloads assembled on the client must not exceed the provider specific token budget (40000 for Gemini, 20000 for OpenAI and Claude).

**Security model**:
- In demo mode, zero external network calls occur, completely removing provider credential exposure and billing abuse.
- In standard mode, credentials pass strictly through an encrypted HTTP only cookie (`cv_ai_key`), preventing malicious client side scripts from reading raw API keys.
- Rate limiting on `/api/ai/query` guards the endpoint against denial of service loops, allowing up to 30 queries per minute per client IP address in BYOK mode and 10 queries per minute in demo mode.

**Configuration required**:
- `AI_COOKIE_SECRET`: 32 byte cryptographic key used by server route handlers to encrypt and decrypt the BYOK cookie (defaults to developmental fallback in local development).
- `GEMINI_API_KEY`: Optional server environment key enabling developer testing when cookies are not provided.

**Critical test scenarios**:
- Happy path: User submits a query asking how file A depends on file B, receiving streaming text and a glowing 3 hop path trace on the canvas, verifies **AC-1**, **AC-4**, **AC-5**.
- Demo mode flow: User clicks a suggested question pill in demo mode without entering an API key, receiving an immediate pre generated architectural summary, verifies **AC-2**.
- Provider switching: User inputs a custom key via the key settings modal, selects Claude, and receives streaming answers through the provider agnostic interface, verifies **AC-3**.
- Hallucination handling: Model proposes an invalid edge, and the system displays an amber warning badge while preserving markdown text, verifies **AC-4**.
- Disconnected modules: User queries the relationship between two independent utility files, and the system reports no dependency path exists while calculating and suggesting the shared directory ancestor, verifies **AC-7**.
- Citation deep linking: User clicks a citation badge pointing to an unopened file, triggering file loading into Monaco, declaration line scroll, and canvas camera centering, verifies **AC-6**.

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

## Consequences

**Positive**:
- Users can ask open ended architectural questions and immediately see the corresponding visual paths illuminated on the graph canvas.
- The zero cost demo mode provides an instant, risk free evaluation experience for users without requiring API keys or billing setup.
- The clean `AIProvider` interface allows swapping models and vendors without modifying core canvas or editor components.
- Deterministic graph validation completely prevents model hallucinations from appearing as false edges on the architecture canvas.
- Storing conversation threads in session storage maintains context across page reloads without requiring a remote database.

**Negative / tradeoffs**:
- Storing keys in encrypted cookies requires server side decryption on each streaming request rather than direct browser to provider calls.
- Condensing large repository graphs into token budgets necessarily omits implementation bodies, limiting the model's awareness of internal function logic.

**Neutral**:
- Reuses the existing `PathTrace` schema from `src/entities/path-trace.ts` without modifying canonical serialization versions.
- Adds new dependencies (`ai`, `@ai-sdk/google`, `@ai-sdk/openai`, `@ai-sdk/anthropic`) to `package.json`.

## Follow-up

- [ ] Connect Vercel MCP server in Antigravity settings for deployment and project inspection as requested during tool discovery.
- [ ] Add `vercel-labs/skills` patterns to `.agents/skills/` once network or package installation access is configured.
- [ ] Consider adding vector embeddings in a future slice if repositories with more than 2,000 files require deeper semantic snippet search.
