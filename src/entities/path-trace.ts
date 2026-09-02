import { z } from "zod";

/**
 * Zod schema validating a PathTrace entity representing a query path between nodes.
 */
export const pathTraceSchema = z.object({
  id: z.string().startsWith("trace:"),
  sourceNodeId: z.string().min(1),
  targetNodeId: z.string().min(1),
  stepNodeIds: z.array(z.string()).readonly(),
  stepEdgeIds: z.array(z.string()).readonly(),
  hopCount: z.number().int().nonnegative(),
  rationale: z.string().nullable(),
  createdAt: z
    .string()
    .datetime({ message: "createdAt must be an ISO 8601 string" }),
});

/**
 * Canonical domain representation of an ordered path trace between two graph nodes.
 */
export type PathTrace = Readonly<z.infer<typeof pathTraceSchema>>;

/**
 * Generates a deterministic path trace identifier.
 * Format: trace:{sourceNodeId}->{targetNodeId}
 */
export function createPathTraceId(
  sourceNodeId: string,
  targetNodeId: string,
): string {
  return `trace:${sourceNodeId}->${targetNodeId}`;
}
