# 0011 · Canvas performance optimization: Rationale

## Context

The current `architecture-canvas.tsx` component relies heavily on global `useGraphStore` selectors, causing full canvas re renders when single node states (like hover) change. Additionally, rendering hundreds of granular symbol nodes simultaneously impacts DOM performance, especially when zoomed out.

## Options considered

1. **Custom Intersection Observers**: Built into node components to handle visibility. *Tradeoff*: High complexity, redundant with React Flow internal logic.
2. **Local Component State for Nodes**: Move all node specific state out of Zustand. *Tradeoff*: Breaks global features like path tracing.
3. **Zustand Sync for Zoom**: Store zoom level in Zustand and compute visibility via selectors. *Tradeoff*: Causes too many global state updates during high frequency scroll events.

## Decision

**Implementation skills**: React Flow, Zustand

We will leverage React Flow native optimization capabilities combined with atomic Zustand selectors:
- **Viewport Pruning**: Rely on React Flow built in `onlyRenderVisibleElements` prop.
- **State Selection**: Break up giant `useGraphStore` selectors in `architecture-canvas.tsx` and use shallow equality or atomic selectors.
- **Progressive Disclosure**: Use React Flow `useOnViewportChange` hook directly in the component to handle zoom level, updating node visibility with a slight throttle (50 to 100ms) to prevent stuttering.
