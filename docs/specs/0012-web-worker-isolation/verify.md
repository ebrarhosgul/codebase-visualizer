# 0012. Web Worker isolation for layout and parsing computations (Verify)

## Verification steps

### Automated tests

1. **Worker utilities and message contracts**:
   - Run `npm test src/lib/workers/__tests__/worker-types.test.ts`
   - Verify request, response, and error envelope type guards and payload structures.

2. **Layout worker client and synchronous fallback**:
   - Run `npm test src/graph/layout/__tests__/layout-worker-client.test.ts`
   - Verify that layoutWorkerClient.computeLayout falls back to synchronous Dagre computation when window.Worker is undefined.
   - Verify that rapid sequential calls properly supersede previous in flight requests.
   - Verify that worker timeouts trigger the fallback cleanly and log a structured warning.

3. **Asynchronous graph layout hook**:
   - Run `npm test src/hooks/__tests__/use-async-graph-layout.test.ts`
   - Verify that useAsyncGraphLayout manages calculation states, updates nodes and edges on completion, and guards against state updates after unmount.

4. **Canvas integration**:
   - Run `npm test src/components/canvas/__tests__/architecture-canvas.test.ts`
   - Verify that ArchitectureCanvas renders correctly with asynchronous layout coordinates and displays the calculation status indicator.

5. **Full test suite and typecheck**:
   - Run `npm run typecheck`
   - Run `npm test`
   - Run `npm run lint`

### Manual verification

1. **Large repository ingestion performance**:
   - Start dev server with `npm run dev`.
   - Submit a medium or large repository (such as facebook/react or zustand).
   - Open Chrome DevTools Performance tab and start recording.
   - Confirm that layout positioning calculates off the main thread in a dedicated Worker thread.
   - Verify that main thread long tasks during layout stay under 50 milliseconds.

2. **Rapid filter toggles and search responsiveness**:
   - Toggle architectural layer chips rapidly in the canvas filter bar.
   - Type multiple search tokens in quick succession.
   - Confirm that the canvas remains responsive without UI lag, and the final displayed layout matches the latest filter selection.

3. **Fallback verification**:
   - Disable Web Workers in browser settings or simulate unsupported environment.
   - Confirm that the application continues to calculate and render layouts smoothly via the synchronous fallback path.
