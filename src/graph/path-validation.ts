import type { CodebaseGraph, PathTrace } from "@/entities";
import { createPathTraceId, pathTraceSchema } from "@/entities";
import { findDependencyPath } from "./path-trace";

/**
 * Result of validating a candidate dependency chain against a CodebaseGraph.
 */
export interface PathValidationResult {
  readonly isValid: boolean;
  readonly trace: PathTrace | null;
  readonly failedAtHop?: number;
  readonly reason?: string;
}

/**
 * Architectural common ancestor information for disconnected modules.
 */
export interface CommonAncestorResult {
  readonly commonDirectory: string;
  readonly distanceA: number;
  readonly distanceB: number;
  readonly fileA: string;
  readonly fileB: string;
  readonly rationale: string;
}

/**
 * Validates a candidate sequence of node identifiers step by step against graph edges.
 * Every consecutive pair must have a verified directed edge in the canonical graph.
 */
export function validateDependencyChain(
  graph: CodebaseGraph,
  candidateNodes: readonly string[],
  rationale?: string,
): PathValidationResult {
  if (candidateNodes.length === 0) {
    return {
      isValid: false,
      trace: null,
      reason: "Candidate path sequence contains no nodes.",
    };
  }

  if (candidateNodes.length === 1) {
    const singleNodeId = candidateNodes[0];
    const trace: PathTrace = {
      id: createPathTraceId(singleNodeId, singleNodeId),
      sourceNodeId: singleNodeId,
      targetNodeId: singleNodeId,
      stepNodeIds: Object.freeze([singleNodeId]),
      stepEdgeIds: Object.freeze([]),
      hopCount: 0,
      rationale: rationale ?? `Single node path for ${singleNodeId}`,
      createdAt: new Date().toISOString(),
    };
    return {
      isValid: true,
      trace: pathTraceSchema.parse(trace) as PathTrace,
    };
  }

  const allNodeIds = new Set<string>([
    ...Object.keys(graph.directories),
    ...Object.keys(graph.files),
    ...Object.keys(graph.symbols),
    ...Object.keys(graph.externalModules),
  ]);

  for (const nodeId of candidateNodes) {
    if (!allNodeIds.has(nodeId)) {
      return {
        isValid: false,
        trace: null,
        reason: `Node "${nodeId}" does not exist in graph.`,
      };
    }
  }

  // Map from `${sourceId}->${targetId}` to edge id
  const directEdgeMap = new Map<string, string>();
  for (const edge of Object.values(graph.edges)) {
    const key = `${edge.sourceId}->${edge.targetId}`;
    if (!directEdgeMap.has(key)) {
      directEdgeMap.set(key, edge.id);
    }
  }

  const stepEdgeIds: string[] = [];

  for (let i = 0; i < candidateNodes.length - 1; i++) {
    const fromId = candidateNodes[i];
    const toId = candidateNodes[i + 1];
    const key = `${fromId}->${toId}`;
    const edgeId = directEdgeMap.get(key);

    if (!edgeId) {
      return {
        isValid: false,
        trace: null,
        failedAtHop: i + 1,
        reason: `No directed edge exists from "${fromId}" to "${toId}".`,
      };
    }

    stepEdgeIds.push(edgeId);
  }

  const sourceNodeId = candidateNodes[0];
  const targetNodeId = candidateNodes[candidateNodes.length - 1];

  const trace: PathTrace = {
    id: createPathTraceId(sourceNodeId, targetNodeId),
    sourceNodeId,
    targetNodeId,
    stepNodeIds: Object.freeze([...candidateNodes]),
    stepEdgeIds: Object.freeze(stepEdgeIds),
    hopCount: stepEdgeIds.length,
    rationale:
      rationale ??
      `Verified ${stepEdgeIds.length} hop dependency chain from ${sourceNodeId} to ${targetNodeId}`,
    createdAt: new Date().toISOString(),
  };

  return {
    isValid: true,
    trace: pathTraceSchema.parse(trace) as PathTrace,
  };
}

/**
 * Validates a candidate path, falling back to deterministic BFS path discovery
 * when candidate hops fail or are not specified.
 */
export function validateOrDiscoverPath(
  graph: CodebaseGraph,
  sourceNodeId: string,
  targetNodeId: string,
  candidateStepNodeIds?: readonly string[],
  rationale?: string,
): PathValidationResult {
  if (candidateStepNodeIds && candidateStepNodeIds.length >= 2) {
    const validation = validateDependencyChain(
      graph,
      candidateStepNodeIds,
      rationale,
    );
    if (validation.isValid) {
      return validation;
    }
  }

  const discovered = findDependencyPath(graph, sourceNodeId, targetNodeId);
  if (discovered) {
    return {
      isValid: true,
      trace: discovered,
    };
  }

  return {
    isValid: false,
    trace: null,
    reason: `No dependency path connects "${sourceNodeId}" to "${targetNodeId}".`,
  };
}

/**
 * Normalizes a file identifier or file path to clean path segments without the file: prefix.
 */
function extractDirectorySegments(filePathOrId: string): readonly string[] {
  let cleaned = filePathOrId.trim();
  if (cleaned.startsWith("file:")) {
    cleaned = cleaned.slice(5);
  }

  cleaned = cleaned.replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = cleaned.split("/").filter(Boolean);

  // If there are segments, the last segment is the filename; return only directory segments
  if (parts.length > 1) {
    return Object.freeze(parts.slice(0, -1));
  }
  return Object.freeze([]);
}

/**
 * Finds the closest common directory ancestor between two file paths or file node IDs.
 * Used when no directed dependency path connects two modules to explain their architectural separation.
 */
export function findClosestCommonAncestor(
  filePathOrIdA: string,
  filePathOrIdB: string,
): CommonAncestorResult {
  const cleanA = filePathOrIdA.startsWith("file:")
    ? filePathOrIdA.slice(5)
    : filePathOrIdA;
  const cleanB = filePathOrIdB.startsWith("file:")
    ? filePathOrIdB.slice(5)
    : filePathOrIdB;

  const segmentsA = extractDirectorySegments(cleanA);
  const segmentsB = extractDirectorySegments(cleanB);

  const commonSegments: string[] = [];
  const minLength = Math.min(segmentsA.length, segmentsB.length);

  for (let i = 0; i < minLength; i++) {
    if (segmentsA[i] === segmentsB[i]) {
      commonSegments.push(segmentsA[i]);
    } else {
      break;
    }
  }

  const commonDirectory =
    commonSegments.length > 0 ? commonSegments.join("/") : "/";

  const distanceA = segmentsA.length - commonSegments.length;
  const distanceB = segmentsB.length - commonSegments.length;

  let rationale: string;
  if (commonDirectory === "/") {
    rationale = `Modules "${cleanA}" and "${cleanB}" have no direct dependency relationship and meet only at the repository root.`;
  } else {
    rationale = `Modules "${cleanA}" and "${cleanB}" diverge at directory "${commonDirectory}" with ${distanceA} and ${distanceB} respective directory depth difference.`;
  }

  return {
    commonDirectory,
    distanceA,
    distanceB,
    fileA: cleanA,
    fileB: cleanB,
    rationale,
  };
}
