# 0007. Architectural Filtering and Layer Inspection

**Date**: 2026-09-05
**Status**: In Progress

## Summary

This specification defines architectural filtering, directory collapsing, and detailed node inspection for the architecture graph canvas. Developers can isolate architectural layers such as components, hooks, or stores using a top filter bar, prune the visual canvas with automatic layout packing, and collapse noisy folders into summary cards with aggregated dependency counters. The right side inspector panel expands to display incoming callers, outgoing dependencies, exported symbols, and internal function calls with dual action navigation chips that jump to graph nodes and source code declarations simultaneously.

## Context

Reasoning, problem forces, and options considered: see [rationale.md](rationale.md).

## Requirements

**User stories**:
- As a software architect reviewing a large repository, I want to filter the visual graph by architectural layer so that I can evaluate high level subsystem boundaries without visual noise from utility files or external stubs.
- As a developer navigating complex directory trees, I want to collapse entire folders into compact summary cards so that I can declutter the canvas while preserving cross folder dependency connections.
- As an engineer investigating a specific module, I want an inspector panel showing all incoming callers, outgoing dependencies, and internal function calls so that I understand blast radius and coupling before making code changes.

**Acceptance criteria**:
- **AC-1**: Architectural layer classification. The visualizer maps directory paths to standardized architectural layers (components, hooks, stores, entities, lib, api, utils, app, and other) using path convention heuristics. Each layer carries a distinct semantic color token, display label, matching patterns, and priority sort rank.
- **AC-2**: Canvas top layer filter bar. A floating horizontal filter bar above the canvas renders clickable pill badges for all discovered architectural layers with file count chips. Clicking any layer chip toggles its visibility. A clear button resets layer filters back to all visible. Expand all and collapse all buttons trigger bulk directory operations.
- **AC-3**: Graph pruning and smooth Dagre relayout. When layers or folders are filtered out, excluded nodes and edges are pruned from the canvas graph model, and the Dagre layout recalculates to pack remaining visible nodes neatly without empty space. Camera maintains spatial focus using an animated transition.
- **AC-4**: Directory group collapse to aggregate folder cards. Collapsing a directory container replaces the expanded bounding box with a compact summary folder card displaying total file count, external import and export counts, and dominant layer badge. If both parent and child directories are collapsed, the outermost ancestor subsumes descendants recursively. Dominant layer is computed by majority file count, with ties resolved by lowest rank integer. External edges connecting to files inside the directory bundle into weighted summary edges connected to the folder card with count badges.
- **AC-5**: Interactive folder collapse triggers. Users can collapse or expand a folder container by clicking the dedicated chevron button in the folder group header or by double clicking the header area.
- **AC-6**: Real time symbol and file search. A search input in the filter bar performs zero dependency case insensitive multi token matching across file paths and symbol names. All whitespace separated tokens must match (AND condition). Keystrokes are debounced by 200 milliseconds before updating canvas nodes. Camera centering executes only after the debounce settles or upon pressing Enter, focusing the primary match determined by exact name match first, followed by highest caller count.
- **AC-7**: Node Inspector panel enhancements. The right side Inspector panel displays structural details for the active selection. Selecting a file or symbol displays incoming caller dependencies (fan in), outgoing callee dependencies (fan out), exported symbols, internal declarations, and connectivity metrics. Selecting a directory or collapsed folder card displays aggregated directory metrics (total files, total symbols, dominant layer, external callers, external callees) and constituent file lists.
- **AC-8**: Dual action dependency navigation. Clicking any incoming or outgoing dependency chip in the Inspector panel highlights the target node on the canvas and simultaneously reveals its source code declaration in the Monaco code viewer, maintaining bidirectional synchronization.
- **AC-9**: Direct edge filtering and hidden node preservation. Filtered graphs draw direct dependency edges only when both source and destination are visible. If an active selection is hidden by a filter, the Inspector preserves its data with a warning badge stating it is hidden from canvas, alongside a button to reset filters or reveal the node.
- **AC-10**: Empty state recovery. If filter criteria or search queries match zero nodes, the canvas displays an informative empty state illustration with a single click button to reset all active filters.

## Decision

**Chosen option**: Option 1: Client side graph pruning with Dagre relayout, aggregate folder summary nodes with bundled dependency edges, debounced multi token search, integrated Zustand filter slice, and enhanced right side Inspector panel with dual action navigation.

We choose client side pruning with pure Dagre relayout to keep the canvas clean and readable on large repositories. Collapsed directories transform into virtual aggregate folder cards that bundle cross folder import edges with numeric count badges. Filter state lives directly in an integrated slice of `useGraphStore` for zero lag synchronization with canvas rendering and Monaco editor deep linking. Search is debounced by 200 milliseconds with AND token matching to protect the main thread and avoid camera jitter. The right side inspector panel computes detailed incoming callers, outgoing callees, and symbol declarations on demand, offering clickable chips that center the graph camera and reveal source declarations together.

**Implementation skills**: modern-web-guidance (`~/.gemini/config/plugins/modern-web-guidance-plugin/skills/modern-web-guidance/`)

## Rationale

Reasoning, options considered, and forces: see [rationale.md](rationale.md).

## Feature design

**Layer taxonomy and classification heuristics**:

| Layer ID | Label | Accent Color | Matching Path Segments | Priority Rank |
|---|---|---|---|---|
| `components` | Components | Blue (`#3b82f6`) | `components`, `ui`, `views`, `widgets` | 1 |
| `hooks` | Hooks | Cyan (`#06b6d4`) | `hooks`, `composables` | 2 |
| `stores` | Stores | Purple (`#a855f7`) | `stores`, `state`, `context`, `slices` | 3 |
| `entities` | Entities | Emerald (`#10b981`) | `entities`, `models`, `types`, `schemas` | 4 |
| `lib` | Library | Amber (`#f59e0b`) | `lib`, `services`, `core`, `sdk` | 5 |
| `api` | API & Server | Rose (`#f43f5e`) | `api`, `server`, `routes`, `controllers` | 6 |
| `utils` | Utilities | Slate (`#64748b`) | `utils`, `helpers`, `shared`, `common` | 7 |
| `app` | Application | Indigo (`#6366f1`) | `app`, `pages`, `routes`, `layouts` | 8 |
| `other` | Other | Zinc (`#71717a`) | Fallback for unclassified paths | 9 |

**Data model sketch**:

```typescript
export type ArchitecturalLayerId =
  | 'components'
  | 'hooks'
  | 'stores'
  | 'entities'
  | 'lib'
  | 'api'
  | 'utils'
  | 'app'
  | 'other';

export interface ArchitecturalLayer {
  readonly id: ArchitecturalLayerId;
  readonly label: string;
  readonly color: string;
  readonly patterns: readonly string[];
  readonly rank: number;
}

export interface GraphFilterState {
  readonly selectedLayers: readonly ArchitecturalLayerId[];
  readonly collapsedFolderIds: readonly string[];
  readonly searchQuery: string;
  readonly hideExternal: boolean;
}

export interface CollapsedFolderSummary {
  readonly directoryId: string;
  readonly path: string;
  readonly fileCount: number;
  readonly dominantLayerId: ArchitecturalLayerId;
  readonly externalImportCount: number;
  readonly externalExportCount: number;
  readonly childFileIds: readonly string[];
}

export interface DependencyReference {
  readonly edgeId: string;
  readonly sourceFileId: string;
  readonly sourceFileName: string;
  readonly sourceSymbolId: string | null;
  readonly sourceSymbolName: string | null;
  readonly targetFileId: string;
  readonly targetFileName: string;
  readonly targetSymbolId: string | null;
  readonly targetSymbolName: string | null;
  readonly dependencyKind: 'import' | 'call' | 're_export';
  readonly callLine: number | null;
}

export interface NodeMetrics {
  readonly fanIn: number;
  readonly fanOut: number;
  readonly lineCount: number;
  readonly symbolCount: number;
}

export interface NodeInspectionDetail {
  readonly nodeId: string;
  readonly entityType: 'file' | 'symbol' | 'directory';
  readonly displayName: string;
  readonly filePath: string;
  readonly layerId: ArchitecturalLayerId;
  readonly incomingDependencies: readonly DependencyReference[];
  readonly outgoingDependencies: readonly DependencyReference[];
  readonly exportedSymbols: readonly SymbolSummary[];
  readonly internalSymbols: readonly SymbolSummary[];
  readonly metrics: NodeMetrics;
  readonly isVisibleOnCanvas: boolean;
}

export interface SymbolSummary {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly line: number;
  readonly isExported: boolean;
}
```

**State transitions**:

```
Filter State:
[All Visible]
  |-- toggleLayerFilter(id) --> [Layer Filtered]
  |-- toggleFolderCollapse(id) --> [Folder Collapsed]
  |-- setSearchQuery(text, debounced 200ms) --> [Search Filtered]
  |-- resetAllFilters() --> [All Visible]

Selected Node Visibility:
[Node Selected & Visible]
  |-- filterApplied(excludes node) --> [Node Selected & Flagged Hidden]
  |-- revealNode(nodeId) --> [Filters Cleared, Node Selected & Visible]

Hierarchical Directory Collapse:
[Parent & Child Expanded]
  |-- collapseFolder(parent) --> [Parent Virtual Card Visible, Child Subsumed]
  |-- expandFolder(parent) --> [Parent Expanded, Child Collapsed If Contained In collapsedFolderIds]
```

**API surface**:

| Function or Action | Scope | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `toggleLayerFilter` | Zustand action | `layerId: ArchitecturalLayerId` | updates `selectedLayers` | public | none |
| `setLayerFilters` | Zustand action | `layerIds: ArchitecturalLayerId[]` | sets `selectedLayers` | public | none |
| `clearLayerFilters` | Zustand action | none | clears `selectedLayers` to empty | public | none |
| `toggleFolderCollapse` | Zustand action | `folderId: string` | adds or removes from `collapsedFolderIds` | public | none |
| `collapseAllFolders` | Zustand action | none | populates all directory IDs | public | none |
| `expandAllFolders` | Zustand action | none | empties `collapsedFolderIds` | public | none |
| `setSearchQuery` | Zustand action | `query: string` | sets `searchQuery` string | public | none |
| `toggleHideExternal` | Zustand action | none | inverts `hideExternal` boolean | public | none |
| `resetAllFilters` | Zustand action | none | resets all filter criteria | public | none |
| `classifyArchitecturalLayers` | pure utility | `graph: CodebaseGraph` | `readonly ArchitecturalLayer[]` | public | empty graph returns empty array |
| `filterAndAggregateGraph` | pure utility | `graph: CodebaseGraph, filters: GraphFilterState` | `FilteredGraphResult` | public | zero matches returns empty result |
| `getNodeInspectionDetail` | pure utility | `graph: CodebaseGraph, nodeId: string, isVisible: boolean` | `NodeInspectionDetail \| null` | public | invalid nodeId returns null |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Display layer chips | Layer name, color, and file count | Derived from `classifyArchitecturalLayers` and `filterAndAggregateGraph` |
| Prune graph canvas | Visible React Flow nodes and edges | Derived from `filterAndAggregateGraph` using `GraphFilterState` |
| Render collapsed folder | File count and external dependency badges | Computed in `CollapsedFolderSummary` during aggregation |
| Dominant folder layer | Dominant layer badge on folder card | Computed in `CollapsedFolderSummary` via majority vote with rank tie breaker |
| Outermost folder ancestor | Virtual summary card in layout | Resolved by path prefix check in `filterAndAggregateGraph` |
| Draw aggregated edge | Edge label count badge (e.g. 5 imports) | Aggregated count of file to file edges between directories |
| Search primary match | Primary node ID for camera centering | Highest scoring node by exact name match followed by fan in count |
| Inspector fan in / fan out | Total callers and callees | Count of unique incoming and outgoing references in `NodeInspectionDetail` |
| Click dependency chip | Canvas centering and Monaco line jump | Coordinates from `DependencyReference` source/target fileId and line |
| Empty canvas overlay | Filtered empty state message and reset button | Triggered when `visibleFiles.length === 0 && (selectedLayers.length > 0 \|\| searchQuery.length > 0)` |

**Key invariants**:
- Pure graph immutability: filtering and aggregation functions take readonly graph inputs and return new structures without mutating the canonical graph.
- Outermost ancestor precedence: nested collapsed folders are subsumed by their outermost collapsed ancestor; only the ancestor renders as a summary card.
- Deterministic dominant layer: folders compute dominant layer by majority file count; equal counts break ties using the lowest rank integer.
- Debounced search execution: search inputs debounce 200 milliseconds before triggering layout recalculations to prevent main thread blocking.
- Camera stability: camera centering on search occurs only after debounce completes or on Enter keydown; batch expand or collapse triggers an animated fit view locked for 300 milliseconds.
- Bidirectional navigation compatibility: selecting a node in the inspector or code viewer never breaks active layer filters.
- Zero fake connections: dependency edges on the canvas only connect nodes that are currently visible, and transitive connections across hidden nodes are not fabricated.

**Security model**:
- Pure client side state: all classification, filtering, and inspection runs in memory in the user browser.
- No network requests, no user credentials, and no external tracking.

**Configuration required**:
- None. Zero new environment variables or external API tokens are required.

**Critical test scenarios**:
- Happy path: User clicks "components" and "stores" filter chips on the canvas top bar; canvas prunes other layers, recomputes Dagre layout, and displays only matching files and directories, verifies **AC-1**, **AC-2**, **AC-3**.
- Folder collapse with tie breaker: User clicks collapse chevron on `src/components`, the folder cluster collapses to an aggregate folder card with dominant layer badge computed by majority vote, and all internal edges vanish while external edges bundle with count badges, verifies **AC-4**, **AC-5**.
- Nested folder collapse: User collapses `src` while `src/components` is already collapsed; `src` renders as the single outermost card subsuming all descendants, verifies **AC-4**.
- Debounced search and camera focus: User types "useGraphStore" into search bar; search debounces 200 milliseconds, filters canvas to the store, and centers camera smoothly on the store node, verifies **AC-6**.
- Detailed file inspection: User selects a file node; right side Inspector panel displays fan in, fan out, exported symbols, and internal methods with clickable chips, verifies **AC-7**.
- Directory inspection: User selects a directory or collapsed folder card; right side Inspector displays total files, total symbols, dominant layer, and external callers without opening Monaco editor, verifies **AC-7**.
- Dual action navigation: User clicks an incoming caller chip in the Inspector panel; canvas camera centers on caller node, workspace tab opens Monaco editor, and editor reveals caller line with pulse highlight, verifies **AC-8**.
- Selection preservation when filtered: User selects a node and filters out its layer; Inspector retains node details with a "Filtered from canvas" badge and an action button to reveal the node, verifies **AC-9**.
- Empty state recovery: User searches for a non existent token; canvas displays empty state illustration and clicking "Reset Filters" restores all nodes, verifies **AC-10**.

## Build plan

- [x] 1. Create architectural layer taxonomy and heuristic classifier utility with priority ranking in `src/graph/layers.ts`, satisfies **AC-1**.
- [x] 2. Add filter state, action handlers, and 200 millisecond debounced search to Zustand store in `src/stores/graph-store.ts`, satisfies **AC-2**, **AC-6**.
- [x] 3. Implement pure graph filtering, outermost ancestor resolution, dominant layer calculation, and edge aggregation utility in `src/graph/filtering.ts`, satisfies **AC-3**, **AC-4**, **AC-9**.
- [x] 4. Update React Flow adapter and Dagre layout engine to support collapsed folder summary cards and bundled edges in `src/graph/adapters/react-flow-adapter.ts` and `src/graph/layout/dagre-layout.ts`, satisfies **AC-3**, **AC-4**.
- [x] 5. Build interactive folder collapse chevron and double click triggers in `src/components/canvas/folder-group-node.tsx` and create `src/components/canvas/collapsed-folder-node.tsx`, satisfies **AC-4**, **AC-5**.
- [x] 6. Implement floating canvas top filter bar with layer badges, debounced search input, and bulk collapse toggles in `src/components/canvas/layer-filter-bar.tsx`, satisfies **AC-2**, **AC-6**, **AC-10**.
- [x] 7. Create structural inspection calculator utility supporting file, symbol, and directory scopes in `src/graph/inspection.ts`, satisfies **AC-7**, **AC-9**.
- [x] 8. Build enhanced Node Inspector view with dependency lists, metrics, and dual action navigation chips in `src/components/workspace/node-inspector.tsx`, satisfies **AC-7**, **AC-8**, **AC-9**.
- [x] 9. Implement canvas empty state overlay with quick reset action in `src/components/canvas/architecture-canvas.tsx`, satisfies **AC-10**.

## Consequences

**Positive**:
- Significantly improves canvas comprehension by allowing engineers to focus on specific architectural layers in isolation.
- Reduces visual clutter in large codebases by collapsing detailed directory clusters into summary cards with bundled connections.
- Unifies structural dependency inspection with code reading, providing immediate visibility into coupling, callers, and callees.
- Prevents UI thread blocking and camera jitter through debounced search filtering and calm camera targeting.

**Negative / tradeoffs**:
- Recomputing Dagre layout on filter change shifts node positions, which can temporarily disrupt spatial familiarity compared to static dimming.
- In memory edge aggregation introduces brief CPU computation on large graphs with thousands of edges.

**Neutral**:
- Reuses existing React Flow node card primitives and workspace panel split layout without requiring new third party libraries.

## Follow-up

- [ ] Add keyboard shortcuts (such as "/" to focus canvas filter search and "Escape" to clear active filters) in a future refinement pass.
