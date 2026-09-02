import { z } from "zod";
import { sourceLocationSchema, type SourceLocation } from "./source-location";

export const edgeKindSchema = z.enum([
  "file_import",
  "re_export",
  "call",
  "type_reference",
  "heritage",
  "contains",
]);

export type EdgeKind = z.infer<typeof edgeKindSchema>;

export const edgeMetadataSchema = z.object({
  callSites: z.array(sourceLocationSchema).readonly().optional(),
  importSpecifiers: z.array(z.string()).readonly().optional(),
  isDynamicImport: z.boolean().optional(),
});

export type EdgeMetadata = Readonly<{
  callSites?: readonly SourceLocation[];
  importSpecifiers?: readonly string[];
  isDynamicImport?: boolean;
}>;

/**
 * Zod schema validating a GraphEdge entity.
 */
export const graphEdgeSchema = z.object({
  id: z.string().startsWith("edge:"),
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  kind: edgeKindSchema,
  weight: z.number().int().positive(),
  isExternal: z.boolean(),
  metadata: edgeMetadataSchema.optional(),
});

/**
 * Canonical domain representation of a directed dependency or containment relationship.
 */
export type GraphEdge = Readonly<{
  id: string;
  sourceId: string;
  targetId: string;
  kind: EdgeKind;
  weight: number;
  isExternal: boolean;
  metadata?: EdgeMetadata;
}>;

/**
 * Generates a deterministic edge identifier from connection endpoints and relationship kind.
 * Format: edge:{sourceId}->{targetId}:{kind}
 */
export function createEdgeId(
  sourceId: string,
  targetId: string,
  kind: EdgeKind,
): string {
  return `edge:${sourceId}->${targetId}:${kind}`;
}

export interface CreateGraphEdgeParams {
  readonly sourceId: string;
  readonly targetId: string;
  readonly kind: EdgeKind;
  readonly isExternal?: boolean;
  readonly weight?: number;
  readonly metadata?: EdgeMetadata;
}

/**
 * Creates a validated GraphEdge with a deterministic identifier.
 */
export function createGraphEdge(params: CreateGraphEdgeParams): GraphEdge {
  const isExternal = params.isExternal ?? params.targetId.startsWith("ext:");
  const edge: GraphEdge = {
    id: createEdgeId(params.sourceId, params.targetId, params.kind),
    sourceId: params.sourceId,
    targetId: params.targetId,
    kind: params.kind,
    weight: params.weight ?? 1,
    isExternal,
    ...(params.metadata ? { metadata: params.metadata } : {}),
  };

  return graphEdgeSchema.parse(edge) as GraphEdge;
}

export interface EdgeAggregationParams {
  readonly callSites?: readonly SourceLocation[];
  readonly importSpecifiers?: readonly string[];
  readonly isDynamicImport?: boolean;
  readonly weightIncrement?: number;
}

/**
 * Pure function that aggregates repeated relationships into a single edge with incremented weight
 * and merged call site / specifier metadata.
 */
export function aggregateEdge(
  existingEdge: GraphEdge,
  aggregation: EdgeAggregationParams,
): GraphEdge {
  const weightIncrement = aggregation.weightIncrement ?? 1;
  const newWeight = existingEdge.weight + weightIncrement;

  const existingCallSites = existingEdge.metadata?.callSites ?? [];
  const additionalCallSites = aggregation.callSites ?? [];
  const mergedCallSites = [...existingCallSites, ...additionalCallSites];

  const existingSpecifiers = existingEdge.metadata?.importSpecifiers ?? [];
  const additionalSpecifiers = aggregation.importSpecifiers ?? [];
  const mergedSpecifiers = Array.from(
    new Set([...existingSpecifiers, ...additionalSpecifiers]),
  );

  const isDynamicImport =
    aggregation.isDynamicImport ?? existingEdge.metadata?.isDynamicImport;

  const metadata: EdgeMetadata = {
    ...(mergedCallSites.length > 0 ? { callSites: mergedCallSites } : {}),
    ...(mergedSpecifiers.length > 0
      ? { importSpecifiers: mergedSpecifiers }
      : {}),
    ...(isDynamicImport !== undefined ? { isDynamicImport } : {}),
  };

  const updatedEdge: GraphEdge = {
    ...existingEdge,
    weight: newWeight,
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
  };

  return graphEdgeSchema.parse(updatedEdge) as GraphEdge;
}
