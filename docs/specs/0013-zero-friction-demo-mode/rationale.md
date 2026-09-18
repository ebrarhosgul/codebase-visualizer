# 0013. Zero friction demo mode with graph heuristics: rationale

Decision record for [index.md](index.md). `/develop` does not need this file.

## Context

The AI panel already has a demo mode (spec 0008) and an offline demo runtime (spec 0010), but a visitor who opens the app with no API key gets very little from it. `DemoAIProvider` keyword matches three scenarios and streams fixed paragraphs; the only repository specific content is a count of files per layer and the first few files in insertion order. Prompt chips are four hardcoded strings shown only while the thread is empty. Nothing lights up on the canvas except a path trace.

Demo mode is also not free. `useAiQueryStream` only runs the demo provider in the browser when `navigator.onLine` is false. Online, every demo query POSTs the entire graph to `/api/ai/query`, which runs the same demo provider on the server and counts against the demo rate limit (10 requests per window). For a public showcase that is bandwidth, compute, and rate limit exposure for an answer the browser could produce itself.

The canvas has just been through two performance slices (0011 viewport pruning and decoupled hover state, 0012 layout in a Web Worker). A streaming answer that re renders the panel dozens of times a second, or a highlight that touches hundreds of nodes, would give that work back. The scope row for this feature sets a hard bar: 60 FPS on the canvas while an answer streams.

The forces: the graph in memory already has everything a useful structural answer needs (files, internal import edges, a path based layer taxonomy, exported symbols); the team is small and the stack is settled (Next.js 15, React 19, Zustand, React Flow); there is no budget for a hosted model in demo mode; and honesty matters, since a visitor who mistakes a heuristic for a model will be disappointed by the first question it cannot answer. Not deciding means the first thing a reviewer sees is generic text, and every demo click keeps hitting the server.

## Options considered

### Option 1: Fix in place

Keep `DemoAIProvider` as it is and enrich each of the three scenarios with more counts: fan in ranking inside the overview, a layer matrix inside the layer scenario. Add a `highlight` event where convenient. Keep server side execution when online.

**Pros**:
- Smallest diff; no new modules or store fields.
- No interface changes to `AIProvider` or the hook.

**Cons**:
- The keyword routing and the answer text stay tangled in one 300 line generator, so each new chip grows the tangle.
- Does not meet "costs nothing server side" unless the routing change is made anyway.
- Fan in would be recomputed per query with no shared index, and no clean seam for tests of the ranking math.

### Option 2: Strangler, a heuristic engine beside the existing provider

Build a small engine: a memoized `HeuristicIndex` in the graph module, an intent router, one pure answer builder per chip, and a word chunker. `DemoAIProvider` becomes an adapter that resolves the intent, runs a builder, and streams the result. The path trace scenario moves behind the `path_trace` intent unchanged. The hook runs demo client side unconditionally; the server demo branch stays as unreached code until a later cleanup.

**Pros**:
- Each piece is pure and testable on its own (index math, router table, builder output, chunk cadence).
- Zero server cost and offline parity fall out of one routing change.
- The index is reusable by later canvas features.
- The old path trace behavior is preserved, so nothing a user relies on changes.

**Cons**:
- More files and two small interface widenings (`hints` on `streamQuery`, `highlight` on the event union).
- Two dimming sources on the canvas need a one at a time rule.
- The server demo branch lingers as dead code for one slice.

### Option 3: A real model in the browser

Run a small language model client side (a WebGPU or WebAssembly runtime loading a quantized model) so the demo gives genuine semantic answers with no key.

**Pros**:
- Answers are not limited to structural heuristics.
- Still zero server cost.

**Cons**:
- Hundreds of megabytes downloaded before the first answer, which is the opposite of zero friction.
- WebGPU availability and memory limits vary by device; many visitors would get a broken demo.
- The frame budget would be gone: token generation competes with the canvas for the same machine.
- Answer quality on a 20k token graph summary from a small model is poor and unpredictable, which undermines the honesty goal.

### Option 4: Server side demo with a shared free tier key

Keep demo queries on the server and let them use a project owned provider key with a strict quota, so demo answers are real model answers.

**Pros**:
- Best answer quality for visitors.
- No client side engine to build.

**Cons**:
- A real bill and a key to protect; a public showcase is exactly where abuse happens.
- Quota exhaustion turns the demo off for everyone at once.
- Does not meet "costs nothing server side" and still uploads the graph per query.

## Rationale

Option 2 is chosen because it is the only option that satisfies all four forces at once: repository specific answers, zero server cost, a protected frame budget, and honesty. The graph in memory already carries the facts a structural answer needs, so a pure index plus a few builders gives useful, citable answers with a few milliseconds of compute. Routing demo queries to the browser unconditionally is a one line intent with a large effect: no graph upload, no rate limit consumption, and offline parity for free.

Option 1 was seriously considered; fixing in place is often right. It fails here because the value of this feature is in the ranking and layer math, and that math needs a seam to test and reuse. Growing the existing generator would make the third chip harder than the first. Option 3 fails the "zero friction" premise on download size alone, and Option 4 trades a cost problem for a security problem.

On streaming: the answer is computed in full and then streamed as word chunks. That is presentation, not computation, and the spec says so in the footer copy. The alternative (no streaming) would make demo answers feel different from BYOK answers and would remove the one visual cue that the panel is working. The 30 ms cadence keeps that theater short. The once per frame coalescing turns out not to be the thing carrying the frame budget, since a 30 ms chunk interval is already slower than a 16.7 ms frame and rarely has more than one chunk to coalesce; the real per chunk cost is `MarkdownMessage` re parsing the whole accumulated answer on every chunk, so that component is memoized as part of this spec. The headed trace in the verification pass proves the budget rather than assuming it, in line with the lesson from spec 0011 that the in app browser pane cannot measure frames, and it now spans the highlight commit too, since flipping the dimmed state on every non highlighted node is the single largest node update in this feature and the earlier draft's measurement window ended before it happened.

On highlighting: reusing `highlightedNodeIds` with a `highlightSource` discriminator was preferred over a second id list because the canvas already has two dimming paths (an active trace, and a hovered or selected node's connected set) sharing one folder group "has active child" rule. Adding a source flag folds the answer highlight into that same single code path instead of opening a third, independent one. The one at a time rule (an answer highlight clears a trace and a node selection clears an answer highlight, and vice versa) is the price of that simplicity, and it matches what a user expects when they ask a new question or click something else on the canvas.

On the hidden node count: the panel, not the provider, computes it, because only the canvas knows what is rendered after filtering in the worker. Publishing `visibleFileIds` from the canvas to the store is one field and one effect, and avoids re running the filter on the main thread.

## Cross check adjustments

A cross check pass on a different model found nineteen decision completeness gaps and several soundness issues in the first draft, and every one of them is folded into `index.md` and the paragraphs above rather than kept as a separate list here. The shape of what changed, grouped by theme:

- **Counting rules that were left to the builder to guess.** How import edges are counted (distinct file pairs, edge weight ignored, the two edge kinds deduplicated), how inverted layer pairs turn into the concrete file paths the templates show, how layer and file ties break, and how state flow's hop counts and cycle handling work all now have one named rule each, instead of a formula that could not actually produce what the answer templates show.
- **Values with no named source.** Chip description text, exact citation field values (and dropping the old fake code snippet), the exact tooltip string, and which node ids count as "visible" for the hidden files footer were all referenced without saying where they come from; each now has one.
- **Real code paths the first draft did not account for.** A collapsed folder hiding a cited file, an edge's appearance during a highlight, a node click mid highlight, an existing double firing bug in the streaming completion callback, and who calls abort on a repository change were all gaps between the spec's prose and what the current canvas and hook code actually do.
- **The frame budget aimed at the wrong cost**, corrected above, plus its measurement window now covers the highlight commit, not just the text stream.
- **Two factual errors about the existing codebase**, both now corrected: `src/graph/inspection.ts` exists (see Diagnosis), and only one of the four legacy suggested prompts changes intent, not two.

## Diagnosis of the current implementation

- `src/lib/ai/demo-provider.ts`: three keyword scenarios (path, layer, general). The layer scenario counts files per layer; the general scenario prints totals; both cite `files.slice(0, n)` in insertion order. Paragraph chunks are streamed with a 25 ms sleep.
- `src/hooks/use-ai-query-stream.ts`: the demo provider runs in the browser only when `navigator.onLine === false`; otherwise a POST with the full graph goes to `/api/ai/query`.
- `src/app/api/ai/query/route.ts`: `isDemo` selects the same `DemoAIProvider` on the server and applies a 10 per window rate limit.
- `src/stores/graph-store.ts`: `highlightedNodeIds` is set only by `setActiveTrace`; `ArchitectureCanvas` gates dimming on `Boolean(activeTrace)`.
- `src/components/trace/trace-panel.tsx`: `SUGGESTED_PROMPTS` (four strings) render only in the empty state; the "Demo Mode" badge has no explanation; the thread persists to sessionStorage per repository.
- `src/graph/context-summary.ts`: already computes fan in over `file_import` and `re_export` edges for BYOK prompts, a second copy of the same metric.
- `src/graph/inspection.ts`: a third copy of a fan in style metric (`NodeMetrics`, used by `getNodeInspectionDetail`), already shipped and in the tree. `src/graph/AGENTS.md` wrongly lists this file as missing; that row is stale, not this file.

## Answer templates (guidance for the builders)

Each builder returns markdown using only headings, bold, inline code, and bullets.

**Layer breakdown**

```
### Architecture of `owner/repo`

**Layers by file count**
- **Components**: 41 files
- **Lib**: 18 files
- ...

**Strongest cross layer dependencies**
- Components → Hooks: 42 imports
- Hooks → Stores: 17 imports
- Components → Lib: 12 imports

**Inverted dependencies** (a lower level layer importing a higher one)
- `src/lib/format.ts` → `src/components/ui/badge.tsx`
(or: No inverted layer dependencies detected.)

Representative files: `src/components/canvas/architecture-canvas.tsx`, `src/lib/utils.ts`, ...
```

**Central files**

```
### Most central files in `owner/repo`

Ranked by fan in (how many internal files import them) over 312 internal import edges.

1. `src/entities/index.ts`: imported by 27 files, imports 9
2. `src/lib/utils.ts`: imported by 19 files, imports 1
...

A file with high fan in is a change amplifier: editing it touches everything that imports it.
```

**State management flow**

```
### State management flow in `owner/repo`

Found 2 store modules in the stores layer.

**`src/stores/graph-store.ts`** (imported by 11 files)
- Hooks: `src/hooks/use-deep-linking.ts`, `src/hooks/use-async-graph-layout.ts`
- Components: `src/components/canvas/architecture-canvas.tsx`
  - which is imported by `src/components/layout/workspace-layout.tsx`, ...

(fallback first sentence: No `stores` layer was found, so this answer looks for exported symbols named like a store, state, context, or provider.)
```

**Overview (typed input that matched nothing)**

```
### `owner/repo` at a glance

- 138 files, 312 internal import edges, 24 directories
- Largest layers: Components (41), Lib (18), Hooks (9)

Demo mode answers questions about layers, central files, state management flow, and dependency paths between two files. For anything else, add your own key.
```

Every answer ends with the footer rendered by the panel (not part of the markdown): "Computed from the loaded dependency graph, no AI model involved." plus the "Add your own key" action, and the hidden files line when applicable.
