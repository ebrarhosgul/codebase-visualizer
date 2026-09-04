# Rationale: Bidirectional Graph and Code Deep Linking

This document records the decision context, alternatives considered, and reasoning behind specification 0006.

## Context

Codebase Visualizer presents an interactive split view workspace where developers see an architectural graph on the canvas alongside raw source code in the Monaco Editor. In the walking skeleton slice, selecting a file card in the canvas opened the file in the code tab. However, navigation remained strictly one directional and coarse. Selecting a node did not scroll the editor to specific function or class declarations, moving the editor cursor did not highlight or center the corresponding element on the graph, and the browser URL did not reflect active inspection state.

This lack of synchronization creates three major friction points:

First, navigating large files requires manual scrolling and searching. When a developer inspects a module in the visual graph, they want to see the exact declaration rather than hunting through hundreds of lines of code.

Second, code inspection lacks spatial context. When an engineer reads through unfamiliar source code in the editor, they cannot easily tell where the active function or class fits into the larger dependency graph without manually searching the canvas.

Third, exploration states are ephemeral. If a developer discovers an interesting architectural boundary or circular dependency, they cannot copy the browser URL to share that exact view with a teammate or bookmark it for later. Refreshing the browser resets the canvas to an unselected state.

Several forces shape this decision:
- **Event loop prevention**: If clicking a node updates the editor, and moving the editor cursor focuses the graph, an uncoordinated event pipeline creates an infinite ping pong loop that locks the browser UI.
- **Cold start ingestion race conditions**: When a user opens a shared deep link URL in a fresh browser tab, the repository source code must be downloaded, unpacked, and parsed before the target file and line can be focused. The navigation coordinates must be buffered safely until hydration completes.
- **Browser history ergonomics**: Continual camera movements or cursor line jumps must not spam the browser history stack with hundreds of entries.
- **Data model consistency**: Target locations must use the canonical one indexed `SourceLocation` representation already defined in the domain schema.

## Options considered

### Option 1: Next.js App Router query parameter synchronization with Zustand time lock coordination, Monaco range decorations, and React Flow camera centering

Represent deep link state using clean query parameters (`repo`, `branch`, `file`, `line`, `symbol`) updated via Next.js router transitions for discrete clicks and native `window.history.replaceState` for high frequency cursor navigation. Maintain a dedicated `NavigationTarget`, coordinate matching (`lastProgrammaticTarget`), and a 300 millisecond time lock in `useGraphStore`. Programmatically drive Monaco line scrolling with temporary pulse decorations and center React Flow viewports using debounced cursor listeners.

**Pros**:
- Query parameters are universally readable, bookmarkable, and compatible with Next.js App Router search params.
- Using `window.history.replaceState` for cursor movements updates the address bar without triggering Next.js route re-renders or editor typing stutter.
- The dual guard (300 millisecond time lock plus coordinate matching) cleanly eliminates circular camera and cursor update loops even when files mount lazily.
- Buffering deep link parameters in Zustand ensures smooth cold start hydration while repository archives stream and parse.

**Cons**:
- Requires holding Monaco and React Flow runtime instances in component state or refs.
- Query strings can become lengthy when linking deep nested paths.

### Option 2: Hash fragment permalinks with decoupled event emitter bus and manual code tab activation

Store code coordinates in URL hash fragments like `#L10-L25` or `#symbol:renderApp` similar to GitHub permalinks. Use an independent pub sub event emitter to broadcast navigation events across components, leaving the right inspector tab unchanged until manually clicked by the user.

**Pros**:
- Hash changes avoid triggering Next.js route re-renders.
- Matches GitHub source line permalink conventions.

**Cons**:
- Hash fragments do not serialize well into multi dimensional state (such as combining repository, branch, file, line, and symbol simultaneously).
- Requiring manual tab switching defeats the primary goal of immediate visual context synchronization.
- Decoupled event emitters bypass React and Zustand unidirectional data flow, making state debugging difficult.

### Option 3: Dedicated nested route pages with server rendered file views

Create dedicated Next.js dynamic routes such as `/repo/[owner]/[repo]/[...path]` to represent individual files and symbols as distinct URLs. Render files on the server and mount graph overlays on demand.

**Pros**:
- Clean REST style URL structure.
- Distinct routes allow per file metadata and search engine indexing.

**Cons**:
- Incompatible with the in memory virtual file system and client side interactive canvas architecture established in Slice 1.
- Navigating between files would cause full page route transitions, destroying canvas layout state and React Flow camera positions.
- Ingestion data is client streamed and session bound, not stored in a persistent database.

## Decision

**Chosen option**: Option 1: Next.js App Router query parameter synchronization with Zustand time lock coordination, Monaco range decorations, and React Flow camera centering.

We select Option 1 because query parameters integrate seamlessly with Next.js 15 client hooks (`useSearchParams`, `useRouter`) while keeping all navigation state in the central `useGraphStore`. The 300 millisecond time lock offers an elegant and robust guard against event loops. Buffering incoming coordinates ensures that deep links work reliably even during cold start repository ingestion.

## References

**Project sources**:
- `AGENTS.md`: Tracer Bullet delivery strategy and pure function state management conventions
- `docs/specs/0003-graph-and-repository-data-model/index.md`: Canonical `SourceLocation`, `FileNode`, and `SymbolNode` schemas
- `docs/specs/0005-walking-skeleton-loop/index.md`: Walking skeleton loop architecture, SSE ingestion pipeline, and Monaco split pane layout
- `src/entities/source-location.ts`: 1-indexed range schema matching Monaco editor coordinates
- `src/stores/graph-store.ts`: Central Zustand graph store and selection actions

**Practices & standards**:
- Unidirectional data flow with explicit event origin tagging
- Anti loop suppression using time lock fences
- Debounced cursor inspection for performance optimization
- Graceful degradation for missing or moved deep link targets
