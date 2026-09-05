# Verify: Architectural filtering and layer inspection, spec 0007 (created 2026-09-05)

_Steps derived from spec 0007 acceptance criteria and value sourcing guarantees. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual

- [ ] Click architectural layer filter pills in the canvas top bar (for example, components or stores) → canvas prunes excluded nodes and Dagre packs visible nodes neatly without dead space → AC-1, AC-2, AC-3
- [ ] Click the Clear button in the layer filter bar → all layers restore to visible and canvas recomputes full layout → AC-2, AC-3
- [ ] Click the collapse chevron or double click a folder group header (such as `src/components`) → folder collapses into a compact aggregate folder card showing file counts, dominant layer badge, and external dependency counts → AC-4, AC-5
- [ ] Collapse `src` while `src/components` is already collapsed → outermost ancestor (`src`) renders as the single summary card subsuming nested folders → AC-4
- [ ] Observe dependency edges connected to a collapsed folder → multiple file to file imports consolidate into weighted summary edges displaying count badges → AC-4
- [ ] Click the Expand All or Collapse All buttons in the canvas toolbar → all directory groups collapse to summary cards or expand to full containers with animated camera fit view → AC-2, AC-4, AC-5
- [ ] Type a search query into the filter bar search input → search debounces 200 milliseconds, canvas isolates matching nodes using AND token matching, and camera centers smoothly on the primary match without jitter → AC-6
- [ ] Select any file or symbol card on the canvas → right side Inspector panel displays fan in callers, fan out callees, exported symbols, and internal methods → AC-7
- [ ] Select a directory or collapsed folder card → Inspector displays aggregated directory metrics (total files, total symbols, dominant layer, external callers) without opening Monaco → AC-7
- [ ] Click an incoming or outgoing dependency chip in the Inspector panel → canvas camera centers on the target node, workspace tab switches to code, and Monaco scrolls to the declaration line → AC-8
- [ ] Select a node and apply a layer filter that excludes it → Inspector retains selection with a "Filtered from canvas" warning banner and a button to reveal the node → AC-9
- [ ] Type a search query that matches zero files or symbols → canvas displays an informative empty state illustration with a "Reset Filters" action button that clears criteria → AC-10

## Value sourcing checks

- [ ] Verify layer classification heuristics correctly categorize directories (`components`, `hooks`, `stores`, `entities`, `lib`, `api`, `utils`, `app`) → verifies `classifyArchitecturalLayers` pattern matching
- [ ] Verify dominant layer tie breaker resolves to lowest rank integer on equal file counts → verifies `CollapsedFolderSummary.dominantLayerId`
- [ ] Verify outermost ancestor resolution subsumes nested child collapses → verifies `filterAndAggregateGraph` directory pruning
- [ ] Verify edge bundling sums counts accurately between directory clusters without losing destination targets → verifies edge aggregation logic in `filterAndAggregateGraph`
- [ ] Verify dependency chips in Node Inspector carry correct source and target line numbers for Monaco reveal → verifies `DependencyReference.callLine`

## Commands

- [ ] `npm run typecheck` → strict TypeScript checks pass across layer classifier, filter store slice, and inspection utilities → AC-1, AC-2, AC-7
- [ ] `npm run lint` → clean lint execution across new filter bar components, inspector views, and graph utilities → AC-2, AC-6, AC-7
- [ ] `npm test` → Vitest suite passes unit tests for layer classification, graph pruning, edge bundling, and inspection metrics → AC-1, AC-3, AC-4, AC-7
- [ ] `npm run build` → Next.js production build succeeds with clean client bundle boundaries → AC-2, AC-3, AC-10

## Acceptance criteria coverage

- AC-1 architectural layer classification covered by `src/graph/layers.ts` and layer classifier unit tests
- AC-2 canvas top layer filter bar covered by `src/components/canvas/layer-filter-bar.tsx`
- AC-3 graph pruning and smooth Dagre relayout covered by `src/graph/filtering.ts` and Dagre layout tests
- AC-4 directory group collapse to aggregate folder cards covered by `src/components/canvas/collapsed-folder-node.tsx` and edge aggregation tests
- AC-5 interactive folder collapse triggers covered by `src/components/canvas/folder-group-node.tsx`
- AC-6 real time symbol and file search covered by debounced multi token matcher in `src/graph/filtering.ts` and search input tests
- AC-7 node inspector panel enhancements covered by `src/graph/inspection.ts` and `src/components/workspace/node-inspector.tsx`
- AC-8 dual action dependency navigation covered by dependency chip handlers in `src/components/workspace/node-inspector.tsx`
- AC-9 direct edge filtering and hidden node preservation covered by `src/graph/filtering.ts` and inspector state tests
- AC-10 empty state recovery covered by empty state overlay in `src/components/canvas/architecture-canvas.tsx`
