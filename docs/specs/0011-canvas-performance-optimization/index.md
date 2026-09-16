# 0011 · Canvas performance optimization

**Status**: Accepted
**Code area**: `src/components/canvas/`, `src/stores/`

## Summary

Optimize the React Flow canvas to maintain smooth 60 FPS interactions on large graphs with hundreds of nodes. We will rely on React Flow viewport pruning, decouple node specific state from global re renders, and use zoom based progressive disclosure for symbol nodes.

## Requirements

- **AC-1**: Offscreen nodes are skipped from rendering automatically.
- **AC-2**: Hovering or interacting with a single node does not trigger a full canvas re-render.
- **AC-3**: Symbol nodes are hidden when the zoom level is below 1.2 and revealed when zooming in.
- **AC-4**: Rapid zooming toggles node visibility smoothly without dropping frames or stuttering.

## Build plan

1. [x] **Enable viewport pruning** [AC-1]
   - [x] Add `onlyRenderVisibleElements={true}` to the `<ReactFlow>` component in `architecture-canvas.tsx`.
2. [x] **Optimize Zustand selectors** [AC-2]
   - [x] Refactor `architecture-canvas.tsx` to use shallow equality for object/array selectors from `useGraphStore`.
   - [x] Ensure node components (`file-node-card.tsx`, etc.) subscribe only to their specific state slices if they need store access.
3. [x] **Implement progressive disclosure** [AC-3, AC-4]
   - [x] Add a throttled `useOnViewportChange` hook inside the canvas component.
   - [x] When zoom crosses the threshold (e.g., 1.2), dynamically update the `hidden` property of symbol nodes via React Flow internal state (or `setNodes` from the store if necessary, but minimizing render cycles).

## Consequences

- **Positives**: Significantly improved canvas performance on large graphs; reduced DOM overhead.
- **Negatives**: Slight delay (throttle) when zooming in quickly before symbol nodes appear.

## Follow up

- Monitor performance on extremely large repositories (e.g., thousands of files) to see if Web Worker layout calculation is needed.
