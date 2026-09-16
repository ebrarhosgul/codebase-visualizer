import type { CodebaseGraph } from "@/entities";
import type {
  CodebaseReactFlowNode,
  CodebaseReactFlowEdge,
} from "@/graph/adapters/react-flow-adapter";
import type { GraphFilterState } from "@/stores/graph-store";
import type { DagreLayoutOptions } from "@/graph/layout/dagre-layout";

export type WorkerErrorCode =
  "LAYOUT_FAILED" | "INVALID_INPUT" | "TIMEOUT" | "INTERNAL_ERROR";

export interface WorkerEnvelope<TType extends string, TPayload> {
  readonly id: string;
  readonly type: TType;
  readonly payload: TPayload;
  readonly timestamp: number;
}

export interface LayoutWorkerRequestPayload {
  readonly graph: CodebaseGraph;
  readonly filters: GraphFilterState;
  readonly options: DagreLayoutOptions;
}

export type LayoutWorkerRequest = WorkerEnvelope<
  "COMPUTE_LAYOUT",
  LayoutWorkerRequestPayload
>;

export interface LayoutWorkerSuccessPayload {
  readonly nodes: readonly CodebaseReactFlowNode[];
  readonly edges: readonly CodebaseReactFlowEdge[];
  readonly durationMs: number;
}

export type LayoutWorkerSuccessResponse = WorkerEnvelope<
  "LAYOUT_SUCCESS",
  LayoutWorkerSuccessPayload
>;

export interface LayoutWorkerErrorPayload {
  readonly code: WorkerErrorCode;
  readonly message: string;
}

export type LayoutWorkerErrorResponse = WorkerEnvelope<
  "LAYOUT_ERROR",
  LayoutWorkerErrorPayload
>;

export type LayoutWorkerResponse =
  LayoutWorkerSuccessResponse | LayoutWorkerErrorResponse;

/**
 * Creates a typed request envelope with a monotonic identifier and current timestamp.
 */
export function createWorkerRequest<TType extends string, TPayload>(
  id: string,
  type: TType,
  payload: TPayload,
): WorkerEnvelope<TType, TPayload> {
  return Object.freeze({
    id,
    type,
    payload,
    timestamp: Date.now(),
  });
}

/**
 * Creates a typed success response envelope.
 */
export function createWorkerSuccessResponse<TPayload>(
  id: string,
  payload: TPayload,
): WorkerEnvelope<"LAYOUT_SUCCESS", TPayload> {
  return Object.freeze({
    id,
    type: "LAYOUT_SUCCESS",
    payload,
    timestamp: Date.now(),
  });
}

/**
 * Creates a typed error response envelope.
 */
export function createWorkerErrorResponse(
  id: string,
  code: WorkerErrorCode,
  message: string,
): LayoutWorkerErrorResponse {
  return Object.freeze({
    id,
    type: "LAYOUT_ERROR",
    payload: Object.freeze({
      code,
      message,
    }),
    timestamp: Date.now(),
  });
}

/**
 * Type guard validating if an object conforms to a success response envelope.
 */
export function isLayoutWorkerSuccessResponse(
  response: unknown,
): response is LayoutWorkerSuccessResponse {
  if (!response || typeof response !== "object") {
    return false;
  }
  const candidate = response as Partial<LayoutWorkerSuccessResponse>;
  return (
    candidate.type === "LAYOUT_SUCCESS" &&
    typeof candidate.id === "string" &&
    typeof candidate.timestamp === "number" &&
    candidate.payload !== undefined &&
    Array.isArray(candidate.payload.nodes) &&
    Array.isArray(candidate.payload.edges) &&
    typeof candidate.payload.durationMs === "number"
  );
}

/**
 * Type guard validating if an object conforms to an error response envelope.
 */
export function isLayoutWorkerErrorResponse(
  response: unknown,
): response is LayoutWorkerErrorResponse {
  if (!response || typeof response !== "object") {
    return false;
  }
  const candidate = response as Partial<LayoutWorkerErrorResponse>;
  return (
    candidate.type === "LAYOUT_ERROR" &&
    typeof candidate.id === "string" &&
    typeof candidate.timestamp === "number" &&
    candidate.payload !== undefined &&
    typeof candidate.payload.code === "string" &&
    typeof candidate.payload.message === "string"
  );
}
