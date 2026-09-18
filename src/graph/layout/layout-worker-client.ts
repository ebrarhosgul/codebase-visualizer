import type {
  LayoutWorkerRequestPayload,
  LayoutWorkerSuccessPayload,
  LayoutWorkerResponse,
  WorkerErrorCode,
} from "@/lib/workers/worker-types";
import {
  createWorkerRequest,
  isLayoutWorkerSuccessResponse,
  isLayoutWorkerErrorResponse,
} from "@/lib/workers/worker-types";
import { executeLayoutComputation } from "./layout-computation";

export const LAYOUT_TIMEOUT_MS = 5000;

export interface LayoutClientError extends Error {
  readonly code: WorkerErrorCode | "SUPERSEDED";
}

export function createLayoutClientError(
  code: WorkerErrorCode | "SUPERSEDED",
  message: string,
): LayoutClientError {
  const error = new Error(message) as LayoutClientError;
  Object.defineProperty(error, "code", {
    value: code,
    enumerable: true,
    writable: false,
  });
  return error;
}

interface InFlightRequest {
  readonly id: string;
  readonly resolve: (value: LayoutWorkerSuccessPayload) => void;
  readonly reject: (reason: LayoutClientError) => void;
  readonly timeoutId: ReturnType<typeof setTimeout>;
}

/**
 * Checks whether native Web Worker instantiation is supported in the current environment.
 */
export function isWorkerSupported(): boolean {
  return typeof window !== "undefined" && typeof window.Worker !== "undefined";
}

/**
 * Singleton client managing layout worker lifecycle, monotonic request tracking,
 * busy-worker termination, 5000ms timeout guard, and synchronous test fallback.
 */
export class LayoutWorkerClient {
  private worker: Worker | null = null;
  private currentRequest: InFlightRequest | null = null;
  private requestCounter = 0;
  private readonly workerFactory: () => Worker;

  constructor(workerFactory?: () => Worker) {
    this.workerFactory =
      workerFactory ??
      (() => new Worker(new URL("./layout.worker.ts", import.meta.url)));
  }

  /**
   * Returns true if a layout computation is currently in flight.
   */
  public get isBusy(): boolean {
    return this.currentRequest !== null;
  }

  /**
   * Returns the ID of the active in-flight request, if any.
   */
  public get activeRequestId(): string | null {
    return this.currentRequest?.id ?? null;
  }

  /**
   * Computes layout either in the background Web Worker or synchronously if workers are unsupported.
   *
   * If a new request arrives while the worker is actively computing, the busy worker is
   * immediately terminated and replaced to avoid queued latency backlogs (AC-3).
   */
  public async computeLayout(
    params: LayoutWorkerRequestPayload,
  ): Promise<LayoutWorkerSuccessPayload> {
    // AC-5: Synchronous fallback for headless test (jsdom) and SSR environments
    if (!isWorkerSupported()) {
      return executeLayoutComputation(
        params.graph,
        params.filters,
        params.options,
      );
    }

    // AC-3: Terminate busy worker if currently computing a previous request
    if (this.currentRequest) {
      this.terminateBusyWorker(
        createLayoutClientError(
          "SUPERSEDED",
          "Layout calculation superseded by a newer request",
        ),
      );
    }

    const requestId = `layout-req-${++this.requestCounter}`;

    return new Promise<LayoutWorkerSuccessPayload>((resolve, reject) => {
      let workerInstance: Worker;
      try {
        workerInstance = this.getOrCreateWorker();
      } catch (err) {
        // Fall back to synchronous layout if worker instantiation fails (e.g. CSP or browser restriction)
        console.warn(
          "[LayoutWorkerClient] Failed to instantiate Web Worker, executing synchronous fallback:",
          err,
        );
        try {
          const syncResult = executeLayoutComputation(
            params.graph,
            params.filters,
            params.options,
          );
          resolve(syncResult);
        } catch (syncErr) {
          reject(
            createLayoutClientError(
              "LAYOUT_FAILED",
              syncErr instanceof Error
                ? syncErr.message
                : "Synchronous layout fallback failed",
            ),
          );
        }
        return;
      }

      // AC-6: 5000ms timeout guard
      const timeoutId = setTimeout(() => {
        if (this.currentRequest?.id === requestId) {
          console.warn(
            `[LayoutWorkerClient] Layout computation timed out after ${LAYOUT_TIMEOUT_MS}ms for request ${requestId}`,
          );
          this.terminateBusyWorker(
            createLayoutClientError(
              "TIMEOUT",
              `Layout calculation timed out after ${LAYOUT_TIMEOUT_MS}ms`,
            ),
          );
        }
      }, LAYOUT_TIMEOUT_MS);

      this.currentRequest = {
        id: requestId,
        resolve,
        reject,
        timeoutId,
      };

      const requestEnvelope = createWorkerRequest(
        requestId,
        "COMPUTE_LAYOUT",
        params,
      );

      workerInstance.postMessage(requestEnvelope);
    });
  }

  /**
   * Lazily spawns or retrieves the dedicated Web Worker.
   */
  private getOrCreateWorker(): Worker {
    if (this.worker) {
      return this.worker;
    }

    const worker = this.workerFactory();

    worker.onmessage = (event: MessageEvent<LayoutWorkerResponse>) => {
      const response = event.data;
      if (!this.currentRequest) {
        return;
      }

      // Discard responses from older / mismatched requests
      if (response.id !== this.currentRequest.id) {
        return;
      }

      const { resolve, reject, timeoutId } = this.currentRequest;
      clearTimeout(timeoutId);
      this.currentRequest = null;

      if (isLayoutWorkerSuccessResponse(response)) {
        resolve(response.payload);
      } else if (isLayoutWorkerErrorResponse(response)) {
        reject(
          createLayoutClientError(
            response.payload.code,
            response.payload.message,
          ),
        );
      } else {
        reject(
          createLayoutClientError(
            "INTERNAL_ERROR",
            "Unrecognized response envelope from layout worker",
          ),
        );
      }
    };

    worker.onerror = (event: ErrorEvent) => {
      console.warn("[LayoutWorkerClient] Worker runtime error:", event.message);
      if (this.currentRequest) {
        const { reject, timeoutId } = this.currentRequest;
        clearTimeout(timeoutId);
        this.currentRequest = null;
        reject(
          createLayoutClientError(
            "INTERNAL_ERROR",
            event.message || "Worker crashed during layout computation",
          ),
        );
      }
      this.terminate();
    };

    this.worker = worker;
    return worker;
  }

  /**
   * Terminates the active worker and rejects any pending promise.
   */
  private terminateBusyWorker(reason: LayoutClientError): void {
    if (this.currentRequest) {
      clearTimeout(this.currentRequest.timeoutId);
      this.currentRequest.reject(reason);
      this.currentRequest = null;
    }

    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }

  /**
   * Explicitly terminates any running worker instance and cancels active timers.
   */
  public terminate(): void {
    if (this.currentRequest) {
      clearTimeout(this.currentRequest.timeoutId);
      this.currentRequest.reject(
        createLayoutClientError(
          "SUPERSEDED",
          "Layout worker terminated by client",
        ),
      );
      this.currentRequest = null;
    }

    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}

export const layoutWorkerClient = new LayoutWorkerClient();
