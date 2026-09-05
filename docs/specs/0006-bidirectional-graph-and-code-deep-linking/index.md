# 0006. Bidirectional Graph and Code Deep Linking

**Date**: 2026-09-04
**Status**: Accepted

## Summary

This specification establishes bidirectional deep linking between the architecture graph canvas and the Monaco code viewer. Selecting any node on the graph opens the target file, scrolls directly to the declaration line, and highlights the code with a temporary pulse glow. Moving the editor cursor across functions or types identifies the enclosing declaration and smoothly centers the graph camera on that component. Every location change reflects in browser query parameters (`repo`, `branch`, `file`, `line`, `symbol`) so that developers can copy and share exact views with teammates.

## Context

Reasoning, problem forces, and options considered: see [rationale.md](rationale.md).

## Requirements

**User stories**:
- As a developer exploring an unfamiliar codebase, I want to click any file or symbol card on the graph canvas so that the source editor opens immediately and scrolls directly to the declaration line.
- As an engineer reading implementation code, I want my cursor movement in the editor to locate and highlight the matching graph node so that I always understand how the active code fits into the surrounding architecture.
- As a technical lead reviewing system structure, I want shareable URLs containing repository, file, and symbol coordinates so that sending a link to a teammate brings them to the exact visual and source context.

**Acceptance criteria**:
- **AC-1**: Bidirectional URL synchronization. Next.js router query parameters (`repo`, `branch`, `file`, `line`, `symbol`) synchronize with active selection in both directions. Opening a URL with query parameters restores repository state, focuses the canvas on the target node, reveals the file in Monaco Editor, and scrolls to the target declaration line. To eliminate router re-render thrashing during continuous typing or cursor movements, high frequency updates use `window.history.replaceState` while discrete node clicks use `router.replace`. The deep linking hook in `src/app/page.tsx` is wrapped in a React `<Suspense>` boundary to satisfy Next.js 15 requirements.
- **AC-2**: Canvas to editor navigation and line reveal. Clicking any file or symbol node in the React Flow canvas switches the right workspace tab to code, loads the target file, scrolls Monaco smoothly to the symbol declaration line using `revealLineInCenter`, and applies a temporary pulse highlight decoration with a two second fade out.
- **AC-3**: Editor to canvas reverse focus. As the user moves the cursor or selects text in Monaco Editor, a debounced handler (150 milliseconds) identifies the innermost symbol (filtering symbols where `startLine <= cursorLine <= endLine` and selecting the smallest line span) or enclosing file, and smoothly centers the React Flow camera on the corresponding graph node via `setCenter(x, y, { zoom: 1.2, duration: 800 })`.
- **AC-4**: Anti loop coordination. A dual guard combining a 300 millisecond time lock (`lockedUntil`) and coordinate matching (`lastProgrammaticTarget: { fileId, line }`) suppresses reverse synchronization when navigation is triggered programmatically, preventing ping pong camera and cursor loops even if lazy editor mounting takes longer than 300 milliseconds.
- **AC-5**: AST parser symbol declaration extraction. The in memory `ts-morph` AST parser extracts top level declarations (functions, classes, interfaces, type aliases, enums) with accurate one indexed `SourceLocation` ranges, populating `FileNode.symbolIds` and registering canonical `SymbolNode` entities in the `CodebaseGraph`.
- **AC-6**: Missing or invalid target graceful fallback. If an incoming URL deep link references a file, line, or symbol that does not exist in the parsed repository, the application falls back gracefully to the root graph view, displays an informative toast notification, and strips the invalid parameters from the URL.
- **AC-7**: Deep link ingestion hydration. When a user opens a fresh browser tab with deep link parameters, the repository ingestion streams as normal while buffering the navigation coordinates in state, executing camera focus and code line jump as soon as the graph and source files are parsed.
- **AC-8**: Share link quick action. A dedicated share button in the workspace header and editor toolbar copies the current deep link URL with active coordinates to the clipboard and displays a confirmation notification.

## Decision

**Chosen option**: Option 1: Next.js App Router query parameter synchronization with Zustand time lock coordination, Monaco range decorations, and React Flow camera centering.

We choose query parameter synchronization (`?repo=...&file=...&line=...&symbol=...`) handled through Next.js router transitions for discrete clicks and `window.history.replaceState` for debounced cursor navigation. A dedicated `NavigationTarget`, coordinate matching, and 300 millisecond time lock in `useGraphStore` coordinate both views without circular loops. `code-viewer.tsx` and `architecture-canvas.tsx` subscribe to `activeTarget` via `useEffect` to trigger imperative Monaco and React Flow APIs cleanly. The in memory `ts-morph` parser extracts top level symbol declarations so that graph clicks jump to exact declaration lines, while Monaco cursor change events perform debounced reverse lookups to center the React Flow viewport smoothly.

**Implementation skills**: modern-web-guidance (`~/.gemini/config/plugins/modern-web-guidance-plugin/skills/modern-web-guidance/`)

## Rationale

Reasoning, options considered, and forces: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**:

```typescript
export type NavigationSource = 'canvas' | 'editor' | 'url' | 'search';

export interface NavigationTarget {
  readonly fileId: string;
  readonly symbolId?: string | null;
  readonly line?: number | null;
  readonly column?: number | null;
  readonly source: NavigationSource;
  readonly timestamp: number;
}

export interface DeepLinkState {
  readonly activeTarget: NavigationTarget | null;
  readonly lockedUntil: number;
  readonly pendingTarget: NavigationTarget | null;
  readonly lastProgrammaticTarget: { readonly fileId: string; readonly line: number } | null;
}

export interface DeepLinkUrlParams {
  readonly repo?: string;
  readonly branch?: string;
  readonly file?: string;
  readonly line?: string;
  readonly symbol?: string;
}
```

**State transitions**:

- `IDLE`: No deep link navigation in flight. Canvas and editor operate independently.
- `BUFFERED`: Incoming URL parameters detected while repository is still ingesting. Target stored in `pendingTarget`.
- `HYDRATING`: Repository ingestion completes. `pendingTarget` dispatched to `activeTarget`.
- `NAVIGATING_TO_CODE`: Canvas node clicked. `lockedUntil` set to `now + 300ms`, `lastProgrammaticTarget` set to target coordinates. Code tab activated, file loaded, Monaco line revealed with pulse decoration, URL updated via `router.replace`.
- `NAVIGATING_TO_GRAPH`: Monaco cursor moved to line. If `now >= lockedUntil` and coordinates differ from `lastProgrammaticTarget`, debounced lookup matches innermost symbol or file. `lockedUntil` set to `now + 300ms`. Canvas camera centers smoothly on node via `setCenter(x, y, { zoom: 1.2, duration: 800 })`, address bar updated via `window.history.replaceState`.
- `LOCKED`: Active time window (300 milliseconds) or coordinate match where incoming reverse events are ignored to prevent feedback loops.

**API surface**:

| Function / Action | Scope | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `navigateToTarget` | Client Store | `target: NavigationTarget` | Updates `activeTarget`, sets `lockedUntil` and `lastProgrammaticTarget` | None | Missing file ignored gracefully |
| `bufferDeepLink` | Client Store | `params: DeepLinkUrlParams` | Sets `pendingTarget` | None | Invalid query params discarded |
| `flushPendingDeepLink` | Client Store | `graph: CodebaseGraph` | Activates target or triggers fallback | None | Target missing in graph triggers toast |
| `revealTargetInEditor` | Editor Component | `line: number, range?: SourceLocation` | Scrolls editor, applies temporary CSS glow | None | Line out of bounds clamps to end line |
| `focusNodeInCanvas` | Canvas Component | `nodeId: string, durationMs?: number` | Smoothly pans and zooms React Flow camera | None | Missing node id logs warning |
| `syncUrlParams` | Navigation Hook | `target: NavigationTarget` | Updates browser address bar | None | History stack preserved |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Deep link URL generation | `repo`, `branch` | Active repository state in `useGraphStore` |
| Deep link URL generation | `file` | Relative file path from selected `FileNode.path` |
| Deep link URL generation | `line` | Symbol declaration start line from `SourceLocation.startLine` or editor cursor line |
| Deep link URL generation | `symbol` | `SymbolNode.name` from matched symbol entity |
| Canvas to editor jump | Target file content | In memory `fileSources[fileId]` map in `useGraphStore` |
| Canvas to editor jump | Target scroll line and column | `SymbolNode.selectionRange` or `range.startLine` from parsed symbol entity |
| Editor to canvas jump | Canvas camera coordinates (x, y) | Target `Node.position` from React Flow node lookup |
| Fallback notification | Explanatory message text | Toast component describing unresolvable file or symbol name |

**Key invariants**:
- Single source of navigation truth: `useGraphStore` governs the active file, active symbol, and active navigation target.
- Loop suppression: Any programmatic navigation sets `lockedUntil = performance.now() + 300` and records `lastProgrammaticTarget`, strictly preventing ping pong event loops.
- Deterministic IDs: Symbol identifiers follow canonical schema `symbol:{filePath}#{symbolName}` and file identifiers follow `file:{path}`.
- Sanitized file paths: File paths extracted from query parameters are normalized and matched against parsed repository file keys, preventing directory traversal or invalid file access.

**Security model**:
- Public client execution: Deep links operate on public GitHub repository code already fetched and parsed in memory.
- Input validation: Query parameters (`repo`, `branch`, `file`, `line`, `symbol`) are strictly validated against alphanumeric, slash, dot, and hyphen patterns. Any invalid characters trigger immediate parameter clearance and fallback to the repository root.

**Configuration required**:
- No external environment variables or API secrets required. Feature operates entirely within client state and existing ingestion APIs.

**Critical test scenarios**:
- Happy path canvas to editor: Click symbol node on React Flow canvas, verify code tab opens, Monaco scrolls to declaration line, and line decoration displays, verifies **AC-2**, **AC-8**.
- Happy path editor to canvas: Move cursor to function declaration in Monaco, verify debounced event fires, React Flow camera centers on corresponding symbol node with readable zoom, and address bar updates via replaceState, verifies **AC-3**, **AC-1**.
- Anti loop verification: Trigger canvas click followed by simulated cursor event within 200 milliseconds, verify second event is ignored by time lock and coordinate matching, verifies **AC-4**.
- Deep link cold start hydration: Load page with `?repo=facebook/react&file=packages/react/src/React.js&line=25`, verify repository fetches, buffers target, and jumps to line 25 once parsing completes, verifies **AC-1**, **AC-7**.
- Missing target recovery: Load URL with non existent `file=missing.ts&symbol=UnknownFunc`, verify application displays warning toast, displays root canvas, and resets URL parameters cleanly, verifies **AC-6**.
- Symbol parsing coverage: Ingest sample file with functions, classes, and types, verify AST parser generates `SymbolNode` entities with correct line ranges and attaches symbol IDs to parent `FileNode`, verifies **AC-5**.

## Build plan

1. [x] **AST symbol declaration extraction**: Expand `src/lib/parser/ast-parser.ts` using `ts-morph` to inspect source file statements, creating canonical `SymbolNode` records for top level functions, classes, interfaces, and type aliases with accurate 1 indexed `SourceLocation` ranges, and populate `FileNode.symbolIds`, satisfies **AC-5**.
2. [x] **Navigation target state and dual guard anti loop lock**: Extend `src/stores/graph-store.ts` with `NavigationTarget`, `pendingTarget`, `lockedUntil`, and `lastProgrammaticTarget` state, adding actions `navigateToTarget`, `bufferDeepLink`, `flushPendingDeepLink`, and `isNavigationLocked`, satisfies **AC-4**, **AC-8**.
3. [x] **Monaco Editor line reveal, pulse highlight, and cursor listener**: Update `src/components/editor/code-viewer.tsx` to retain editor and monaco instances on mount, subscribe via `useEffect` to `useGraphStore.activeTarget` to execute `revealLineInCenter` and two second pulse decorations, and wire `onDidChangeCursorPosition` with 150 millisecond debounce and innermost symbol calculation, satisfies **AC-2**, **AC-3**.
4. [x] **React Flow programmatic camera centering**: Update `src/components/canvas/architecture-canvas.tsx` to hook into `useReactFlow`, subscribe via `useEffect` to `useGraphStore.activeTarget` to execute `setCenter(x, y, { zoom: 1.2, duration: 800 })`, and support visual node card focus states, satisfies **AC-3**, **AC-4**.
5. [x] **Bidirectional URL deep linking hook with Suspense wrapper**: Create `src/hooks/use-deep-linking.ts` using `window.history.replaceState` for debounced cursor movements and `router.replace` for discrete clicks, and integrate inside a React `<Suspense>` boundary in `src/app/page.tsx`, satisfies **AC-1**, **AC-6**, **AC-7**.
6. [x] **Share link button and fallback toast notifications**: Add a copy link button with clipboard feedback to `src/components/workspace/repo-submission-bar.tsx` and editor toolbar, and display non intrusive error alerts when bookmarked files or symbols are missing, satisfies **AC-6**, **AC-8**.

## Consequences

**Positive**:
- Eliminates context switching friction by linking visual architecture directly to source code lines.
- Enables collaborative sharing: team members can share exact links to specific architectural modules and functions.
- Enriches the internal domain graph with first class symbol declarations, laying the groundwork for semantic AI path tracing in later slices.

**Negative / tradeoffs**:
- AST parsing takes slightly more CPU time per file to extract symbol declarations, though caching and limiting to top level items keeps overhead minimal.
- URL query parameters become longer when deep linking into nested files and specific symbol declarations.

**Neutral**:
- Requires Monaco Editor instances to be held in component refs for programmatic scroll commands.
- Canvas camera auto centering during code reading requires a deliberate debounce and time lock to feel natural rather than jarring.

## Follow-up

- [ ] Connect symbol level granularity toggle to React Flow adapter once architectural filtering (Slice 3) introduces layer switches.
- [ ] Add unit and component test suites verifying Monaco decoration timers and React Flow camera coordinates.
