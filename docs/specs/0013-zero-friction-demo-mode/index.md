# 0013. Zero friction demo mode with graph heuristics

**Date**: 2026-09-18
**Status**: Accepted
**Code area**: `src/lib/ai/demo/`, `src/graph/heuristic-index.ts`, `src/hooks/use-ai-query-stream.ts`, `src/components/trace/`, `src/stores/graph-store.ts`

## Summary

A visitor with no API key should still get a useful answer from the AI panel. This spec replaces the canned demo text with answers computed from the dependency graph already in the browser (which files import which, how they group into layers, which files are hubs). Answers stream word by word, light up the files they cite on the canvas, run entirely in the browser at zero server cost, and say plainly that they are local heuristics (rules of thumb computed from the graph, not a language model) with a one click path to add your own key.

## Requirements

**User stories**:
- As a visitor with no API key, I want to click a prompt chip and get a repository specific answer so that I can judge the tool without any setup.
- As a reviewer, I want the answer to highlight the files it talks about on the canvas so that I can see the claim, not just read it.
- As a power user, I want a clear statement that the demo answer is a local heuristic and a one click way to add my key so that I know when to expect real semantic reasoning.
- As the operator, I want demo mode to cost nothing server side so that public traffic cannot run up a bill.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):
- **AC-1**: With no API key stored, the panel opens in demo mode and shows three chips: "Architecture & layer breakdown", "Core bottleneck / central files", and "State management flow". Clicking a chip adds its prompt text as a user message and streams an assistant answer with **zero requests** to `/api/ai/query` (verified by network inspection), online or offline.
- **AC-2**: The layer breakdown answer is derived from the loaded graph: file count for the top 5 layers by count (ties broken by `ArchitecturalLayer.rank` ascending, the `other` layer included in the count list), the top 3 layer to layer dependency pairs by distinct internal import count (a `(sourceId, targetId)` pair counts once even when both a `file_import` and a `re_export` edge exist between the same two files, and edge `weight` is ignored), or the sentence "No cross layer imports detected." when there are none, and up to 5 example inverted pairs as concrete file paths (an `entities`, `lib`, `utils`, or `api` file importing a `components`, `hooks`, `stores`, or `app` file, `other` excluded from this check, ordered by source layer rank then path ascending), or the sentence "No inverted layer dependencies detected." It cites files per listed layer using a two pass allocation: one highest fan in file per layer first (5), then a second file for the top 3 layers by file count (3 more), 8 citations total.
- **AC-3**: The central files answer ranks the top 5 files with fan in greater than 0 (number of distinct internal files importing them, deduplicated across `file_import` and `re_export` edges, `weight` ignored) over internal edges only, external modules excluded, showing fan in and fan out per file, ties broken by fan out descending then path ascending by raw codepoint comparison (not locale aware), and cites each ranked file. When no file has fan in greater than 0, it uses the AC-10 honest paragraph instead of a ranking.
- **AC-4**: The state management flow answer seeds from files in the `stores` layer (at most 3, by fan in descending, tie break by path). For each seed it lists up to 3 direct importers total (hop 1, ranked by fan in descending then path, then grouped by layer for display), then, for only the single highest fan in hop 1 importer per store, up to 3 of that importer's own importers (hop 2, same ranking). A `seen` set of file ids spans the whole chain (seed, hop 1, hop 2 across all stores); any file already shown is skipped rather than repeated, which also prevents an import cycle from listing a seed as its own hop 2 importer. Citations are emitted in traversal order (each seed, then its hop 1 importers by layer rank, then its hop 2 importers), deduplicated by file id, truncated at 8. When the `stores` layer is empty it falls back to up to 3 files whose `graph.symbols[sid]?.name` (guarding the case where `sid` has no symbol record) matches `/store|state|context|provider|atom|slice/i`, ranked by fan in then path, and says so in the first sentence; when that is empty too it says no state management pattern was detected and cites nothing.
- **AC-5**: A demo answer is computed in full before any text is emitted, then streamed as chunks of 2 to 4 tokens at about 30 ms intervals, where a token is a whitespace run, a `**bold**` span, or an inline code span, each counted as one unit so a chunk boundary never falls inside one. Text state updates in the panel are coalesced to at most one per animation frame. `MarkdownMessage` is memoized and re parses only on new content, not on every parent render. While an answer streams and its highlight event lands, on a graph of at least 300 nodes, wheel zoom on the canvas keeps p95 frame time at or under 16.7 ms measured with a DevTools trace in a headed browser (the measurement window covers the full stream through the highlight commit, not just the text phase).
- **AC-6**: After the text, the demo provider emits one `highlight` event carrying the cited file node ids (no extra ranked ids beyond what is cited), capped at 8, except for a `path_trace` answer or a fallback answer (`isFallback: true`), which emit no `highlight` event and no citations. The canvas highlights those nodes and dims the rest, and a folder group containing a highlighted but collapsed file also lights up (extending the existing `hasActiveChild` condition to `isTraceActive || isAnswerHighlight`). Edges are left untouched by an answer highlight (only node dimming applies). The highlight persists until the next query, either of the panel's two clear controls (the "Clear Glow" button and "Clear chat"), selecting a node on the canvas, or a repository change, and never survives a repository change.
- **AC-7**: When some highlighted nodes are hidden by an active layer filter, a collapsed folder, or a search query, the answer footer shows "N cited files are hidden by current filters" ("1 cited file is hidden by current filters" when N is 1) with a "Show all" action that clears layer filters, expands all folders, and clears the search. `visibleFileIds` is the set of `file` type node ids from the laid out node list (`folderGroup`, `symbol`, and external nodes excluded); while `useAsyncGraphLayout` reports a pending layout the footer line is suppressed rather than shown with a stale count. The user's filters are never changed without that click.
- **AC-8**: The "Demo Mode" header badge has a tooltip reading "Answers are computed from the loaded dependency graph in your browser. No AI model is involved." Every heuristic answer ends with a footer saying "Computed from the loaded dependency graph, no AI model involved." plus an "Add your own key" action that opens the existing key settings dialog. The footer still renders after a page reload (the message carries a `provenance` flag).
- **AC-9**: Typed input in demo mode is routed by keyword to one of the heuristics in this order: state flow, central files, layer breakdown, path trace, then overview, matching lowercased substrings except for `state`, `path`, `hub`, `flow`, and `api`, which require word boundaries so common words like "github" or "pathological" do not misfire. Path trace keeps the existing behavior (dependency path with a canvas trace, or an architectural separation notice). A prompt matching nothing streams a repository overview (file, edge, and directory counts, layer summary) plus one line listing what demo can answer and the "Add your own key" action.
- **AC-10**: With no repository loaded the chips are disabled and the empty state reads "Load a repository to ask questions." With files but no internal `file_import` or `re_export` edges, the central files and state flow answers stream one honest paragraph ("N files parsed, no internal import edges detected, so centrality cannot be ranked") with no citations and no highlight event; the layer breakdown still reports counts.
- **AC-11**: Chips render with their description in the empty state and, once the thread has a message, as a compact horizontally scrollable row above the input. Chips render in demo and BYOK modes alike. In BYOK mode a chip sends its prompt text to the selected provider as a normal query and no highlight event is expected.
- **AC-12**: Starting a new query, changing repository, or pressing either of the panel's two clear controls aborts an in flight demo stream and clears the answer highlight. On a repository change, the existing `repoKey` effect calls `abortQuery()` before reloading the thread; an assistant message that was mid stream is finalized with whatever partial text it has (`status: "complete"`), or dropped if it has none, rather than persisting as stuck "streaming". The demo branch in `use-ai-query-stream.ts` calls `onComplete` exactly once per stream (the existing double call, once on the `done` event and once in `finally`, is fixed as part of this change). The BYOK path, `KeySettingsDialog`, the provider registry, and the server route are unchanged, and the existing AI route and hook tests still pass.
- **AC-13**: The heuristic index (fan in, fan out, layer per file, files per layer, layer matrix) is built in one pass over files and edges, memoized per graph object, and rebuilt only when the graph object changes; two consecutive chip clicks on the same graph build it once.

## Decision

**Chosen option**: Option 2: Strangler, a heuristic engine beside the existing provider

Build a small client side heuristic engine (a memoized graph index, an intent router, and one answer builder per chip) and turn `DemoAIProvider` into a thin adapter over it, while routing demo queries to the browser unconditionally so the server is never touched.

The RECOMMEND calls made here (each with the runner up):

- **Streaming scheduler placement**: the provider owns the timing (token chunks with a 30 ms abortable sleep); the panel owns coalescing (an `onTextChunk` buffer flushed once per `requestAnimationFrame`, flushed synchronously on `done` and cancelled on abort), and `MarkdownMessage` is memoized so a coalesced flush is cheap to render. Runner up: one `setMessages` per chunk as today, rejected because it re renders the panel up to 33 times a second during a stream.
- **Ranking tie break**: fan in descending, then fan out descending, then path ascending. Deterministic output keeps tests stable. Runner up: insertion order, rejected as non deterministic across ingests.
- **One highlight at a time**: an answer highlight clears any active trace, and a trace clears any answer highlight. Runner up: layering both, rejected because two dimming rules on one canvas are unreadable.
- **Legacy messages**: a message with no `provenance` flag renders no footer. Runner up: treat undefined as heuristic, rejected because it would mislabel past BYOK answers.
- **Hidden count ownership**: the panel computes `hiddenCount` from `highlightedNodeIds` minus `visibleFileIds` and renders the line under the most recent heuristic message while `highlightSource === "answer"`. Runner up: persisting node ids on the message, rejected because highlight is canvas state and would stale after reload.
- **"Show all" action composition**: `clearLayerFilters()`, `expandAllFolders()`, `setSearchQuery("")`, in that order. `hideExternal` is untouched because it never hides a repository file.
- **Intent router order and keywords**: see the router table in Feature design. Runner up: scoring by keyword count, rejected as harder to predict and to test.
- **File placement**: the index lives in the graph engine (`src/graph/heuristic-index.ts`) because it is a pure graph metric; the router, chips, chunker, and answer builders live in `src/lib/ai/demo/` beside the provider. Runner up: everything under `src/lib/ai/`, rejected because the index is shareable with the existing node inspection feature (`src/graph/inspection.ts`), not a future one; see Follow-up.
- **Server demo branch**: left in place, unreached by the UI. Runner up: delete it now, rejected to keep the 0010 fallback notice contract (`switch_demo`) untouched in this slice; see Follow-up.
- **Keep the `hints` argument despite router redundancy**: a chip click passes its intent explicitly so chip behavior never depends on keyword rules staying in sync with chip copy, backed by a table driven test that every chip's `promptText` also resolves to its own `intent` through the plain router, so the two paths cannot silently diverge. Runner up: drop `hints` and route chip clicks through the same keyword router as typed input, rejected because today's three chip prompts already resolve correctly on their own, so the interface argument buys real decoupling for a small cost, not a redundant one.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch** (all in memory on the client; the one persisted change is a flag on the existing message type):

| Entity | Lives in | Key | Fields | Relationships and rules |
|---|---|---|---|---|
| `HeuristicIndex` | `src/graph/heuristic-index.ts`, memoized in a `WeakMap<CodebaseGraph, HeuristicIndex>` | graph object identity | `fanIn: Readonly<Record<string, number>>`, `fanOut: Readonly<Record<string, number>>`, `layerByFile: Readonly<Record<string, ArchitecturalLayerId>>`, `filesByLayer: Readonly<Record<ArchitecturalLayerId, readonly string[]>>`, `layerMatrix: Readonly<Record<ArchitecturalLayerId, Readonly<Record<ArchitecturalLayerId, number>>>>`, `invertedEdges: readonly { sourceId: string; targetId: string }[]` (capped at 5, ordered by source layer rank then path ascending), `fileCount: number`, `internalEdgeCount: number` | 1:1 with a `CodebaseGraph`. Counts only edges with `kind` in `{file_import, re_export}` and `isExternal === false` whose source and target are both file ids, deduplicated by `(sourceId, targetId)` so a pair with both edge kinds counts once, and `weight` is ignored throughout. Built by `buildHeuristicIndex(graph)` in one pass, O(files + edges). Frozen. |
| `DemoIntent` | `src/lib/ai/demo/intents.ts` | | `"layer_breakdown" \| "central_files" \| "state_flow" \| "path_trace" \| "overview"` | routing target for chips and typed input |
| `DemoPromptChip` | `src/lib/ai/demo/chips.ts` (constant catalog) | `id` | `id: string`, `label: string`, `description: string`, `intent: DemoIntent`, `promptText: string` | N:1 to `DemoIntent`. Three chips ship: `layer-breakdown` ("Architecture & layer breakdown", description "Layer counts, strongest cross layer imports, and inverted dependencies", prompt "Give me an architecture and layer breakdown of this repository"), `central-files` ("Core bottleneck / central files", description "Top files by fan in, ranked from the import graph", prompt "Which files are the core bottlenecks or most central modules?"), `state-flow` ("State management flow", description "Store modules and what imports them, two hops out", prompt "How does state management flow through this codebase?") |
| `DemoAnswer` | computed by an answer builder before streaming | | `intent: DemoIntent`, `markdown: string`, `citations: readonly CitationRef[]` (max 8, deduplicated by `fileId`), `highlightNodeIds: readonly string[]` (equal to the cited file ids, max 8), `trace: PathTrace \| null`, `isFallback: boolean` | produced from `HeuristicIndex` plus the graph; `isFallback` is true for the AC-10 honest paragraph and the AC-4 empty state, and suppresses both `citations` and `highlightNodeIds` (both empty) |
| `AiQueryMessage` (existing, extended) | sessionStorage thread | `id` | adds `provenance?: "heuristic" \| "model"` | set to `"heuristic"` by the panel when the answer ran in demo mode, `"model"` for BYOK; absent on legacy messages |
| `AIStreamEvent` (existing, extended) | `src/lib/ai/types.ts` | | adds `{ readonly type: "highlight"; readonly nodeIds: readonly string[] }` | emitted once per demo answer after all `text` events and before `done`; server providers never emit it |
| Graph store (existing, extended) | `src/stores/graph-store.ts` | | adds `highlightSource: "trace" \| "answer" \| null`, `visibleFileIds: readonly string[]`, `setAnswerHighlight(nodeIds)`, `setVisibleFileIds(ids)` | `setAnswerHighlight` sets `highlightedNodeIds`, `highlightSource = "answer"`, `activeTrace = null`, `highlightedEdgeIds = []`. `setActiveTrace` sets `highlightSource = "trace"`. `clearTrace` and `setGraph` reset `highlightedNodeIds`, `highlightSource`, and `activeTrace`. |

**State transitions** (highlight state on the store):

`none → answer` on `setAnswerHighlight` · `none → trace` on `setActiveTrace(trace)` · `answer → trace` and `trace → answer` replace each other · `answer → none` on `setHighlightNode` or `navigateToTarget` (selecting a node on the canvas), a third source alongside `clearTrace` in the one at a time rule · `answer | trace → none` on `clearTrace`, `setGraph`, or the start of a new query (the panel calls `clearTrace` before `streamQuery`).

**Intent router** (`resolveDemoIntent(prompt, hint?)`, first match wins, case insensitive, applied to the last user message):

| Order | Intent | Trigger |
|---|---|---|
| 0 | any | an explicit `hint` (from a chip) is returned as is |
| 1 | `state_flow` | `store`, `stores`, `state` (word boundary), `zustand`, `redux`, `context provider`, `global state` |
| 2 | `central_files` | `central`, `bottleneck`, `hub` (word boundary), `most imported`, `core module`, `critical`, `coupling`, `fan in`, `fan-in` |
| 3 | `layer_breakdown` | `layer`, `architecture`, `structure`, `breakdown`, `organized`, `organised` |
| 4 | `path_trace` | `path` (word boundary), `trace`, `connect`, `depends`, `dependency`, `between`, `flow` (word boundary) (unchanged from today, including the sample edge fallback when no file is mentioned) |
| 5 | `overview` | nothing matched (also reached by typing "overview", which no longer matches `layer_breakdown`) |

Matching is a lowercased substring check by default; the word boundary keywords above are matched with `\b` on both sides so a short common word does not misfire inside an unrelated word (for example `hub` inside "github", or `path` inside "pathological").

**Streaming contract** (`DemoAIProvider.streamQuery(messages, context, apiKey?, signal?, hints?)`):

1. `hints?: { readonly intent?: DemoIntent }` is a new optional fifth argument; the `AIProvider` interface gains it as optional so server providers ignore it.
2. Resolve the intent, get or build the `HeuristicIndex`, run the matching builder to a `DemoAnswer`.
3. `chunkMarkdown(markdown)` tokenizes with a span aware pattern (a `**bold**` span, a `` `code` `` span, or a run of non whitespace, in that precedence) so a chunk boundary never falls inside a bold or code span, then groups tokens into chunks of 2, 3, 4, 2, 3, 4 (cycling), keeping newlines attached to the preceding token so markdown structure survives.
4. For each chunk: if `signal.aborted` return; yield `{ type: "text" }`; `await sleep(30, signal)`.
5. Yield `{ type: "trace" }` if `trace` is set (path trace only), then `{ type: "citations" }` if any, then `{ type: "highlight", nodeIds }` only when `citations` is non empty (never for `path_trace` or `isFallback` answers), then `{ type: "done" }`.

**API surface** (client side interfaces; no HTTP endpoint changes):

| Surface | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `buildHeuristicIndex(graph)` / `getHeuristicIndex(graph)` | pure function + memo | `CodebaseGraph` | `HeuristicIndex` | none | never throws; empty graph yields zero counts |
| `resolveDemoIntent(prompt, hint?)` | pure function | prompt string, optional `DemoIntent` | `DemoIntent` | none | none |
| `buildLayerBreakdownAnswer(graph, index)`, `buildCentralFilesAnswer(...)`, `buildStateFlowAnswer(...)`, `buildOverviewAnswer(...)` | pure functions | graph, index | `DemoAnswer` | none | degenerate graphs return `isFallback: true` with no citations or highlight |
| `DemoAIProvider.streamQuery(messages, context, apiKey?, signal?, hints?)` | async generator | thread messages, `AIRequestContext`, `AbortSignal`, intent hint | `AIStreamEvent` sequence (text*, trace?, citations?, highlight?, done) | none | stops silently on abort |
| `useAiQueryStream().streamQuery(options)` | hook | existing options plus `demoIntent?: DemoIntent`, `onHighlight?: (nodeIds) => void` | callbacks | none | demo path never fetches; errors classified with `provider: "demo"` as today |
| Graph store `setAnswerHighlight(nodeIds)`, `setVisibleFileIds(ids)` | Zustand actions | file ids | state | none | none |
| `PromptChips` component (`src/components/trace/prompt-chips.tsx`) | React | `chips`, `variant: "empty" \| "compact"`, `disabled`, `onSelect(chip)` | click events | none | none |
| `DemoAnswerFooter` component (`src/components/trace/demo-answer-footer.tsx`) | React | `hiddenCount`, `onShowAll`, `onAddKey` | click events | none | none |

**Value sourcing** (every value each action produces, computes, or displays names where it comes from):

| Action | Value produced / displayed | Source |
|---|---|---|
| Panel decides demo vs BYOK | `isDemoMode` | existing `GET /api/ai/keys` check (`hasKey`) plus the header toggle, unchanged |
| Chip click | user message text | `DemoPromptChip.promptText` |
| Chip click | which heuristic runs | `DemoPromptChip.intent` passed as `demoIntent`, then `hints.intent` |
| Typed input | which heuristic runs | `resolveDemoIntent` router table above |
| Layer breakdown | file count per layer | `index.filesByLayer[layer].length` |
| Layer breakdown | layer display label | `getLayerDefinition(layer).label` from `src/graph/layers.ts` |
| Layer breakdown | top layer pairs | `index.layerMatrix`, sorted by count desc, top 3, excluding self pairs |
| Layer breakdown | inverted pairs | `index.invertedEdges`, rendered as file paths, capped at 5, ordered by source layer rank then path ascending (`other` excluded from both sides) |
| Layer breakdown | cited files per layer | two pass allocation: one highest `fanIn` file per listed layer first (5), then a second file for the top 3 layers by file count (3 more), 8 total, tie break rule |
| Central files | rank, fan in, fan out | `index.fanIn`, `index.fanOut`, files with `fanIn > 0` only, tie break by `fanOut` desc then path ascending by codepoint, top 5 |
| Central files | file path and name | `graph.files[id].path`, `.name` |
| State flow | store seeds | `index.filesByLayer.stores` sorted by `fanIn` desc then path, top 3; fallback by exported symbol name via `graph.files[id].exportIds` → `graph.symbols[sid]?.name` (optional, some local exports have no symbol record), matched against `/store|state|context|provider|atom|slice/i`, ranked by `fanIn` then path, top 3 |
| State flow | importers per hop | reverse adjacency over the same internal edge set; hop 1 is up to 3 importers per store total (not per layer), hop 2 is up to 3 importers of only the single highest `fanIn` hop 1 importer per store; a `seen` set of file ids spans the whole chain so no file repeats |
| State flow | layer label per importer | `index.layerByFile[id]` |
| Overview | counts | `index.fileCount`, `index.internalEdgeCount`, `Object.keys(graph.directories).length` |
| Any answer | repository name | `context.repository.fullName` |
| Any answer | citation `id`, `label`, `line`, `snippet` | `id = cite:${fileId}_1`, `label = file.path`, `line = 1`, `snippet = null` (no fabricated code text); deduplicated by `fileId`, capped at 8 |
| Any answer | highlight ids | `DemoAnswer.highlightNodeIds`, exactly the cited file ids, cap 8; empty for `path_trace` and `isFallback` answers |
| Canvas dims non highlighted nodes | active set and mode | store `highlightedNodeIds` and `highlightSource` |
| Footer hidden count | `hiddenCount` | `highlightedNodeIds` not in store `visibleFileIds`, which `ArchitectureCanvas` publishes as the `file` type node ids from the laid out node list (excluding `folderGroup`, `symbol`, and external nodes) every time `useAsyncGraphLayout` returns new nodes; suppressed while a layout is pending |
| Footer "Add your own key" | dialog open | `setIsKeyDialogOpen(true)` in `TracePanel` |
| Footer render decision | `provenance === "heuristic"` | set by the panel on the assistant message when `activeDemo` was true at send time |
| Streaming cadence | 30 ms, 2 to 4 tokens | constants in `src/lib/ai/demo/chunker.ts` (`DEMO_CHUNK_INTERVAL_MS`, `DEMO_CHUNK_TOKEN_CYCLE`) |
| Caps | 5 per list, 8 citations, 8 highlights (equal to citations), 3 stores, 3 per hop, 5 inverted pairs | constants in `src/lib/ai/demo/limits.ts` |

**Key invariants**:
- In demo mode the hook never calls `fetch`; the branch that checks `navigator.onLine` is removed and the demo branch runs unconditionally when `isDemo` is true.
- The `HeuristicIndex` is frozen and never mutated; a new graph object means a new index.
- `highlightedNodeIds` is never non empty while `highlightSource` is `null`.
- A `highlight` event is only ever emitted by `DemoAIProvider`, on either side of the wire (the browser path and the server route's still live `isDemo` branch); the SSE parser in the hook tolerates it, and its `switch` has no `default` branch that would throw on it.
- Every cited file id in a `DemoAnswer` exists in `graph.files`.
- All answer builders are pure and synchronous; they take the graph and index and return a `DemoAnswer`.
- Markdown in answers uses headings, bold, inline code, and bullet lists only (what `MarkdownMessage` renders today); no code fences or tables.
- The word chunker never splits inside inline code or a bold span (each span counts as one token, see the Streaming contract).
- An answer highlight never dims or otherwise restyles edges; only node dimming and the extended `hasActiveChild` folder group condition apply.
- `highlightSource` moves to `none` on `setHighlightNode` or `navigateToTarget` (a canvas node selection), same as on `clearTrace`, `setGraph`, or a new query, so node selection is a third source in the one at a time rule, not a fourth uncoordinated one.

**Security model**:
- No authentication surface. Demo mode sends neither the graph nor the thread to the network; the only request the panel makes while in demo mode is the existing `GET /api/ai/keys` on mount.
- The server route keeps its demo branch and its 10 per window demo rate limit for anyone calling the API directly; the UI no longer consumes it.
- No PII, no new storage: `provenance` is one string on a message already stored in sessionStorage.

**Accessibility**:
- Chips are `<button type="button">` elements with the label as text and the description in `aria-describedby`, keyboard reachable in both variants; the compact row is a scrollable region with `aria-label="Suggested prompts"`.
- Highlight is never the only carrier of information: the answer text names every highlighted file.
- The footer "Add your own key" and "Show all" are buttons, not links.

**Configuration required**: none (no new environment variables, flags, or credentials).

**Performance budget**:
- Index build: one pass, O(files + edges); expected under 10 ms at 5,000 files on a laptop.
- Answer builders: sorting bounded lists; expected under 5 ms.
- Streaming: at most 34 `text` events per second, at most one panel state write per frame, one `MarkdownMessage` parse per flushed frame (not per chunk) once it is memoized.
- Highlight: the event itself carries at most 8 node ids, but applying it flips the dimmed state on every other node in the graph (up to hundreds on a large repository) through the existing `setNodes` sync effect in `ArchitectureCanvas` in a single commit; this is the frame the verification pass's trace window must capture, not the 8 ids alone.

**Critical test scenarios** (each maps to an acceptance criterion in ## Requirements):
- Happy path: no key stored, click "Core bottleneck / central files" on a fixture graph with known fan in (including a file with `fanIn: 0` to prove it is excluded from ranking), assert the streamed markdown names the top ranked files in order with the right counts, a `highlight` event carries exactly the cited ids, and `fetch` was never called, verifies **AC-1**, **AC-3**, **AC-6**.
- Layer math: fixture with a `lib` file importing a `components` file via both a `file_import` and a `re_export` edge, assert the pair counts once (not twice) and the inverted pair renders as a concrete file path; fixture with no cross layer imports asserts "No cross layer imports detected.", verifies **AC-2**.
- State flow: fixture with a store, two hop 1 importers (a hook and a component), and the hook's own importer, assert only the higher fan in hop 1 importer expands to hop 2 and the citation order is seed then hop 1 then hop 2; fixture with an import cycle back to the seed asserts the cycle is not repeated; fixture with no `stores` layer but an exported `useAppStore` symbol asserts the fallback sentence; fixture where `exportIds` references a symbol id absent from `graph.symbols` does not throw, verifies **AC-4**.
- Citations: assert every citation has `id`, `label` equal to the file path, `snippet: null`, and that a file cited twice in the same answer appears once, verifies **AC-2**, **AC-3**, **AC-4**.
- Streaming cadence: fake timers, assert chunks are 2 to 4 tokens with a bold span never split across a chunk boundary, emitted 30 ms apart, and that the answer text is identical to the joined chunks; abort mid stream stops emission with no further events, verifies **AC-5**, **AC-12**.
- rAF coalescing and render cost: emit 10 chunks inside one frame, assert one `setMessages` call and one `MarkdownMessage` markdown parse (not one per chunk), verifies **AC-5**.
- Frame budget (manual, headed): follow the canvas frame benchmark procedure (headed `playwright-core`, DevTools trace, a public repository with 300 plus nodes), start a demo stream, wheel zoom through the point the `highlight` event lands, assert p95 frame time at or under 16.7 ms across the whole window, verifies **AC-5**.
- Highlight surface: assert an answer highlight leaves `highlightedEdgeIds` empty and edge props unchanged; a cited file inside a collapsed folder lights up its `folderGroup` node; selecting a canvas node while an answer highlight is active clears it (`highlightSource` back to `null`), verifies **AC-6**.
- Hidden nodes: apply a layer filter that hides two cited files, assert the footer reads "2 cited files are hidden by current filters" and "Show all" clears filters, expands folders, and clears search; assert the footer is suppressed while `useAsyncGraphLayout` reports a pending layout, verifies **AC-7**.
- Notice: reload with a heuristic message in sessionStorage, assert the footer renders and "Add your own key" opens the dialog; a legacy message without `provenance` renders no footer; assert the badge tooltip text matches AC-8's exact string, verifies **AC-8**.
- Router: table driven test over the keyword table including "How do stores connect to canvas?" → `state_flow`, "Trace path between a and b" → `path_trace`, "What's in this GitHub repo?" → not `central_files` (word boundary on `hub`), "overview" typed alone → the `overview` intent, and an unmatched prompt → overview with the "what demo can answer" line; a second test asserts every `DemoPromptChip.promptText` resolves through the router to its own `intent`, verifies **AC-9**.
- Degenerate graphs: empty graph disables chips with the empty state copy; a graph with files but no internal edges yields the honest paragraph with no citations and no highlight; a graph with edges but no file having `fanIn > 0` falls back to the same honest paragraph for central files, verifies **AC-10**.
- Chip surface: empty state shows three chips with their descriptions; after one message the compact row renders; in BYOK mode a chip click calls the fetch path with the prompt text and no `highlight` event is handled, verifies **AC-11**.
- Interrupts: change repository during a stream, assert `abortQuery` was called, the generator was aborted, `highlightedNodeIds` is empty with `highlightSource` null, and a mid stream assistant message is finalized rather than left "streaming"; either clear action does the same, verifies **AC-12**.
- Regression: the demo branch's `onComplete` fires exactly once per stream; existing `src/app/api/ai/__tests__/routes.test.ts` and hook tests pass unchanged, verifies **AC-12**.
- Memoization: call `getHeuristicIndex` twice with the same graph object, assert one build; call with a new object, assert a rebuild, verifies **AC-13**.

## Build plan

Ordered for Tracer Bullet: the first task stands up one chip end to end through every layer (types, index, provider, hook, store, canvas, panel), then the later tasks thicken each layer.

1. **Thin thread, one chip end to end**: add `DemoIntent`, the `highlight` stream event, `provenance` on `AiQueryMessage`, `hints` on `AIProvider.streamQuery`, `demoIntent` and `onHighlight` on the hook; fix the demo branch's duplicate `onComplete` call (today it fires once on `done` and once more in `finally`); build `heuristic-index.ts` (fan in, fan out, layers, matrix, inverted edges, memo, deduplicated by file pair, weight ignored); implement `central-files` builder, the span aware word chunker, and the adapter shape of `DemoAIProvider`; make the hook run demo client side unconditionally; add `highlightSource` and `setAnswerHighlight` to the store, gate canvas node dimming on `activeTrace || highlightSource === "answer"`, extend the folder group `hasActiveChild` condition the same way, and leave edge styling untouched by an answer highlight; memoize `MarkdownMessage` so streaming re renders do not re parse the full accumulated markdown; render the `central-files` chip and the answer footer with the "Add your own key" action, satisfies **AC-1**, **AC-3**, **AC-5** (cadence, coalescing, and render cost), **AC-6**, **AC-8**, **AC-13**
2. **Thicken the answers**: `layer-breakdown` (including the two pass citation allocation and the capped, ordered `invertedEdges`), `state-flow` (hop 1 total cap, single highest fan in hop 1 importer for hop 2, the whole chain `seen` set, and the symbol name fallback guarding an absent `graph.symbols[sid]`), and `overview` builders; the intent router with the keyword table and its word boundary exceptions; a test that every chip's `promptText` resolves to its own `intent` through the router (so the hint and the router table cannot silently diverge); keep the existing path trace scenario behind the `path_trace` intent; degenerate graph handling in every builder, satisfies **AC-2**, **AC-4**, **AC-9**, **AC-10**
3. **Chip surface**: the `DemoPromptChip` catalog, `PromptChips` with `empty` and `compact` variants, disabled state with the empty repository copy, BYOK behavior (prompt text only), and the header badge tooltip, satisfies **AC-1**, **AC-8**, **AC-10**, **AC-11**
4. **Hidden node awareness**: `visibleFileIds` published by `ArchitectureCanvas`, `hiddenCount` in the panel, the footer line and "Show all" action, satisfies **AC-7**
5. **Lifecycle and interrupts**: `clearTrace`, `setGraph`, `setHighlightNode`, and `navigateToTarget` reset the new highlight fields; the panel calls `clearTrace` before each query; the "Clear Glow" button shows when either a trace or an answer highlight is active, and "Clear chat" clears both too; the existing `repoKey` effect calls `abortQuery()` before reloading the thread on a repository change, finalizing or dropping a mid stream assistant message rather than leaving it stuck "streaming", satisfies **AC-12**
6. **Verification pass**: the unit and hook tests listed in Critical test scenarios plus the headed frame trace on a 300 plus node repository, spanning the text stream through the highlight commit, recorded in `verify.md`, satisfies **AC-5**, **AC-13**, and locks the rest

## Consequences

**Positive**:
- Demo mode costs nothing server side and works offline, so public traffic cannot generate provider bills or rate limit noise.
- Answers are specific to the loaded repository and cite real files, which is a much stronger first impression than fixed prose.
- The heuristic index is a reusable graph metric that later canvas features (node inspection, hub badges) can read for free.
- The `highlight` event and `highlightSource` give the canvas a general "light up a set" capability that BYOK answers could use later.

**Negative / tradeoffs**:
- The demo answer quality is bounded by folder naming: layer classification is path based, so repositories with unusual layouts get a thin layer breakdown and may hit the symbol name fallback for state flow. The honest fallback sentences are the mitigation, not a fix.
- Token chunk streaming is theater. It is honest theater (the footer says no model is involved), but a reviewer who notices the instant completion may find it odd. Keeping the cadence fast (30 ms) limits how long the theater lasts.
- Three dimming sources on the canvas (trace, answer highlight, and node selection) add a small amount of state to reason about; the one at a time rule keeps it tractable.
- `AIProvider.streamQuery` grows a fifth optional argument, a wider interface for a demo only concern.

**Neutral**:
- The server route's demo branch becomes dead code from the UI's point of view; removing it is a separate small change (Follow-up).
- `SUGGESTED_PROMPTS` in `trace-panel.tsx` is replaced by the chip catalog; one of its four prompts now routes to `state_flow` instead of `path_trace`, which is the more useful answer for that prompt.
- No migration: one deployment, no data transform, fully reverted by reverting the commit. Legacy sessionStorage threads keep working (no footer on legacy messages).

## Follow-up

- [ ] Remove the `isDemo` branch from `src/app/api/ai/query/route.ts` and the demo rate limit tier once the UI has shipped and no client depends on it; update the 0010 `switch_demo` fallback action to switch the panel mode client side only.
- [ ] `src/graph/AGENTS.md` incorrectly lists `inspection.ts` as missing; it exists (`src/graph/inspection.ts`, `NodeMetrics`, `getNodeInspectionDetail`) and is a third fan in implementation alongside `context-summary.ts` and this spec's `heuristic-index.ts`. `/sync` should correct that row, and a later change should route `NodeMetrics` and `buildTopologyContextSummary` through `getHeuristicIndex` so all three agree.
- [ ] If the demo proves popular, a fourth chip "Entry points & dead ends" is a small addition (the index already has what it needs except orphan detection).
