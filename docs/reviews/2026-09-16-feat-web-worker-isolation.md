# Review, feat/web-worker-isolation, 2026-09-16

**Reviewed by**: review-agent (author on original-model)
**Scope**: 20 files, branch
**Verdict**: Approve with nits

## Summary
The change correctly isolates Dagre hierarchical layout positioning and filtering inside a dedicated Web Worker. It fulfills all acceptance criteria including monotonic request tracking, rapid busy worker termination, and a synchronous test fallback. The worker boundaries are strictly typed and safe. A few minor edge cases around empty states and unmount cleanup remain.

## Minor
### 🟡 Unhandled worker postMessage exceptions, `src/graph/layout/layout-worker-client.ts:165`
**Problem**: The `workerInstance.postMessage(requestEnvelope)` call sits outside a try catch block. If the browser throws a synchronous error like `DataCloneError`, the exception is not caught.
**Why it matters**: If the codebase graph ever contains uncloneable data, the client will fail silently and hang for 5000 milliseconds until the timeout guard triggers a misleading timeout error.
**Suggested fix**: Wrap the `postMessage` call in a try catch block and reject the promise immediately if it throws.

### 🟡 Unnecessary worker error on empty graph, `src/hooks/use-async-graph-layout.ts:133`
**Problem**: When `graph` is null during initial load, the hook casts it with `graph!` and dispatches it to the worker. The worker correctly throws an `INVALID_INPUT` error, which the hook catches and stores in state. The UI hides this because `architecture-canvas.tsx` returns early, but it causes unnecessary background worker churning and console warnings.
**Why it matters**: It wastes resources and pollutes the console on every initial load or empty repository state.
**Suggested fix**: Check if the graph is null or empty inside the hook effect before calling the worker client, and resolve immediately with empty arrays if it is.

### 🟡 Missing layout state cleanup on unmount, `src/hooks/use-async-graph-layout.ts:121`
**Problem**: The hook unmount cleanup clears the debounce timer but does not dispatch `setLayoutCalculationState(false)` to the Zustand store if a calculation is currently in flight.
**Why it matters**: If a user navigates away from the canvas while a layout is calculating, the global graph store retains an active calculating state indefinitely.
**Suggested fix**: Dispatch `setLayoutCalculationState(false)` in the unmount cleanup function if `isCalculatingLayout` is true.

## Nits
- ⚪ `src/stores/graph-store.ts:1071`, The ternary fallback `isCalculating ? state.layoutDurationMs : state.layoutDurationMs` is redundant. Simplify it to `durationMs ?? state.layoutDurationMs`.

## Strengths
- Excellent handling of stale requests via `this.currentRequest` checking and `SUPERSEDED` rejection. Terminating the busy worker immediately on rapid filter changes keeps the UI perfectly responsive.
- The `isWorkerSupported` synchronous fallback provides a very clean testing approach for jsdom without complex Web Worker shims.

## Test coverage
The test suite covers the new logic well. The tests for the worker client explicitly cover busy termination, test fallbacks, and the timeout guard. Types are strictly verified. All newly added branches have solid safety nets.
