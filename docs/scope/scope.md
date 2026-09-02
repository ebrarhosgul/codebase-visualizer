# Scope: Codebase Visualizer

Codebase Visualizer is an interactive developer tool that turns any public GitHub repository into a visual architecture map. It helps engineers and technical leads inspect module relationships, understand code structure side by side with source files, and explore systems using natural language queries.

**Build approach:** Tracer Bullet (prove the whole pipe works with a thin end to end thread before thickening any part).
**Workflow:** Beta (check verify, then test). The project default level of rigor. /architect is the recommended first stop for a feature with a real decision, but skippable when you already know the build. Any feature can carry its own tag (e.g. · GA) to do more or less.

_These are recommendations to keep your build orderly, not requirements. Skip anything that does not fit: if you already know how to build a feature, use /develop and skip /architect. You decide when a feature is done._

## At a glance

| # | Feature | Phase | Status |
|---|---------|-------|--------|
| 1 | Stack & architecture | Foundation | in-progress |
| 2 | Coding standards & tooling | Foundation | in-progress |
| 3 | Graph and repository data model | Foundation | in-progress |
| 4 | Design system & UI foundation | Foundation | in-progress |
| 5 | Walking skeleton loop | Slice 1 | planned |
| 6 | Bidirectional graph and code deep linking | Slice 2 | planned |
| 7 | Architectural filtering and layer inspection | Slice 3 | planned |
| 8 | Semantic AI query and path tracing | Slice 4 | planned |
| 9 | Client cache and ingestion streaming | Slice 5 | planned |

## Foundations

### 1. Stack & architecture · in-progress
Decide the framework, core graph engine, and parser runtime, then scaffold a runnable project so every later slice builds on real structure.
**Done when:** the stack is recorded in a spec and the scaffold boots locally and passes build.
spec [0001](../specs/0001-stack-and-architecture/index.md) · code in `src/`
- [x] Decide the stack (spec): `/architect stack & architecture`
- [x] Scaffold from the decision: `/develop stack & architecture`
- [ ] Smoke check it runs: `/test`

### 2. Coding standards & tooling · in-progress
Capture conventions, then install linting, formatting, and pre commit quality checks from the real scaffolded project.
**Done when:** root `AGENTS.md` reflects the real stack, and lint and format checks run clean.
- [x] Capture conventions + tooling choices: `/audit`
- [x] Install the tooling: `/develop tooling`
- [ ] Check it runs clean: `/test`

### 3. Graph and repository data model · in-progress
Define core domain entities for repositories, files, abstract syntax tree nodes, import relationships, function calls, and query path responses.
**Done when:** the data model represents syntax graphs, symbol definitions, and navigation links without breaking migrations as slices grow.
spec [0003](../specs/0003-graph-and-repository-data-model/index.md) · code in `src/entities/`, `src/graph/`
- [x] Design it (spec): `/architect graph and repository data model`
- [x] Build it: `/develop graph and repository data model`
  - [x] Core schemas: repository, source location, directory, file, and symbol entities (AC-1, AC-2, AC-3, AC-5)
  - [x] Graph edges: taxonomy, aggregation, and external module models (AC-2, AC-4)
  - [x] Canonical container: root graph schema, serialization, and versioning (AC-1, AC-7)
  - [x] Graph operations: cycle safe traversal, path tracing, and React Flow adapter (AC-6, AC-8)
- [x] Verify it: `/check verify graph and repository data model`
- [ ] Test it: `/test graph and repository data model`

### 4. Design system & UI foundation · in-progress
Establish layout primitives for dense split screen exploration, graph canvas styling, typography, and dark mode developer aesthetics.
**Done when:** `design.md` covers color tokens, split panes, canvas controls, and base components meet keyboard and accessibility standards.
spec [0004](../specs/0004-design-system-and-ui-foundation/index.md) · code in `src/components/`, `src/stores/`
- [x] Design it (spec): `/architect design system & UI foundation`
- [ ] Build it: `/develop design system & UI foundation`
  - [x] Tokens & specifications: Semantic color palette, typography scales, globals.css, and living design.md (AC-1, AC-4, AC-8)
  - [ ] Layout state & split panes: Zustand workspace store, react-resizable-panels, and responsive drawer fallbacks (AC-2, AC-7, AC-9)
  - [ ] Interactive primitives: Button, IconButton, Badge, Input, Tooltip, Dialog, Tabs, and DropdownMenu (AC-3, AC-6)
  - [ ] Canvas controls & node cards: Custom React Flow nodes, syntax badges, minimap, and controls toolbar (AC-5)
- [ ] Verify it: `/check verify design system & UI foundation`
- [ ] Test it: `/test design system & UI foundation`

## Slice 1: Walking skeleton loop

### 5. Walking skeleton loop · needs a decision
The thinnest end to end slice: accept a public GitHub URL, parse TypeScript and JavaScript files into basic nodes and dependency edges, render an interactive canvas, and display source code side by side when selecting a node.
**Done when:** a user can submit a public GitHub repository, watch the graph render, click a file node, and view the raw code in a side panel.
- [ ] Design it (spec): `/architect walking skeleton loop`

## Slice 2: Bidirectional graph and code deep linking

### 6. Bidirectional graph and code deep linking · needs a decision
Synchronize focus across views: clicking graph nodes scrolls the code viewer to target symbol declarations, selecting code highlights corresponding graph nodes, and the browser URL reflects the active file and node for easy sharing.
**Done when:** selecting a node jumps directly to the matching code declaration, selecting code focuses the graph element, and copying the URL preserves state.
- [ ] Design it (spec): `/architect bidirectional graph and code deep linking`

## Slice 3: Architectural filtering and layer inspection

### 7. Architectural filtering and layer inspection · needs a decision
Provide canvas controls to zoom, pan, collapse directories, filter by architectural layer, and inspect node detail drawers showing exports, imports, and method calls.
**Done when:** users can filter the graph by folder or architectural layer, search for symbols, and inspect incoming and outgoing dependencies in a detail drawer.
- [ ] Design it (spec): `/architect architectural filtering and layer inspection`

## Slice 4: Semantic AI query and path tracing

### 8. Semantic AI query and path tracing · needs a decision
Enable natural language questions about codebase architecture with optional bring your own API key, generating answers that highlight both exact source lines and visual dependency paths on the graph.
**Done when:** users can ask natural language questions, receive accurate architectural answers, and see both code snippets and graph traversal paths highlighted together.
- [ ] Design it (spec): `/architect semantic AI query and path tracing`

## Slice 5: Client cache and ingestion streaming

### 9. Client cache and ingestion streaming · needs a decision
Add client session caching for parsed graphs to eliminate redundant network fetches, stream real time progress during repository ingestion, and handle GitHub rate limits smoothly with optional personal access token input.
**Done when:** previously analyzed repositories open instantly from session storage, ingestion displays progress stages, and rate limit errors offer friendly token entry.
- [ ] Design it (spec): `/architect client cache and ingestion streaming`

## Deferred
Out of scope for the current build pass, kept so the plan stays honest.
- User accounts and authentication: sign in, personal repository dashboard, and cloud sync · needs a decision
- Multi language parsing: Python, Go, and Rust abstract syntax tree support · needs a decision
- Graph export: export architecture maps as SVG, PNG, or JSON graph data · needs a decision
- Code editing and pull requests: in browser editing, automated refactoring, and git write operations · needs a decision

## Legend

**The decision box.** Every feature carries exactly one, the sub task whose label ends with `(spec)`. Its wording varies (`Design it (spec)` normally, `Decide the stack (spec)` on Stack & architecture), so skills locate it by that `(spec)` suffix, never by an exact label. Every other box is an execution box and `/architect` never ticks one.

**Feature lifecycle**: the scope updates as a feature moves; each row is what it shows and who sets it:

| State | Set by | The feature shows |
|---|---|---|
| `planned` · needs a decision | `/scope` | one box: `Design it (spec): /architect <feature>` |
| `in-progress` (designed) | `/architect` at spec capture | `Design it` ticked; spec linked; `Build it: /develop <feature>` + 2 to 5 milestones; the tier closing boxes (`Verify it` Alpha+, `Test it` Beta+, `Review it` + `Document it` GA); any surfaced follow up enrolled |
| `in-progress` (building) | `/develop` | milestone sub boxes tick one by one; code pointer filled |
| `in-progress` (verified) | `/check verify` | `Build it` + milestones ticked; `Verify it` ticked |
| `done` | you, when you decide it is (any skill sets it when you say so); `/sync` reconciles | boxes you ran ticked, skipped ones marked skipped; the tier suggested closing stage (`Prototype` → after `/develop`; `Alpha` → after `/check verify`; `Beta`/`GA` → after `/test`) is the suggested point to call it done; `/sync` captures conventions |

- **Next step** = the first unticked box (always a command or a tracked milestone).
- **needs a decision** = run `/architect` first; otherwise straight to `/develop` (or `/audit` for standards & tooling). The tag drops once the spec is captured.
- **Atomic build tasks live in the spec ## Build plan, not here**: the scope carries only the milestone rollup.
- **Status** `planned` → `in-progress` → `done`, plus `existing` (pre workflow) and `dropped` (de scoped, kept for history).
- **Approach tag** beside a heading (e.g. `· Facade`) overrides the project default for that feature; no tag = inherits it.
- **Workflow tier tag** beside a heading (e.g. `· GA`, `· Prototype`) sets that one feature rigor above or below the project default; no tag inherits the default. It decides the feature check boxes and each skill next suggestion.
- **Workflow** (header line) is the project default, what runs after `/develop`: **Prototype** = nothing (trust develop own build time self check); **Alpha** = `/check verify`; **Beta** = `/check verify` then `/test`; **GA** = adds a fresh model `/check review` then `/document`. A feature built on an unratified decision (an `Assumed` spec) stays flagged, but that never blocks `done`.
- **Pointer line** (`spec <n> · code in <path>`): the spec link added by `/architect`, the code path by `/develop`.
