import {
  type LayoutWorkerRequest,
  createWorkerSuccessResponse,
  createWorkerErrorResponse,
} from "@/lib/workers/worker-types";
import { executeLayoutComputation } from "./layout-computation";

/**
 * Dedicated Web Worker executing heavy graph filtering, layer taxonomy,
 * search token matching, and Dagre hierarchical coordinate positioning off the main UI thread.
 */
self.onmessage = (event: MessageEvent<LayoutWorkerRequest>): void => {
  const request = event.data;

  if (!request || request.type !== "COMPUTE_LAYOUT") {
    return;
  }

  const { id, payload } = request;

  try {
    if (!payload || !payload.graph || !payload.filters) {
      self.postMessage(
        createWorkerErrorResponse(
          id,
          "INVALID_INPUT",
          "Missing required graph or filter state in layout request payload.",
        ),
      );
      return;
    }

    const result = executeLayoutComputation(
      payload.graph,
      payload.filters,
      payload.options,
    );

    self.postMessage(createWorkerSuccessResponse(id, result));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error computing layout";
    self.postMessage(createWorkerErrorResponse(id, "LAYOUT_FAILED", message));
  }
};
