import { ZodError } from "zod";
import { codebaseGraphSchema, type CodebaseGraph } from "./codebase-graph";
import { CURRENT_SCHEMA_VERSION } from "./repository";

/**
 * Discriminative result pattern representing either success or an explicit failure.
 */
export type Result<T, E> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: E };

/**
 * Structured validation failure returned during deserialization.
 */
export interface ValidationError {
  readonly code: "VERSION_MISMATCH" | "SCHEMA_ERROR" | "JSON_PARSE_ERROR";
  readonly message: string;
  readonly expectedVersion?: number;
  readonly receivedVersion?: number;
  readonly issues?: readonly string[];
}

/**
 * Serializes a canonical CodebaseGraph into a JSON string.
 */
export function serializeCodebaseGraph(graph: CodebaseGraph): string {
  return JSON.stringify(graph);
}

/**
 * Safely parses and deserializes raw data or JSON strings into a validated CodebaseGraph.
 * Returns an explicit Result type with error details on validation or version failure.
 */
export function deserializeCodebaseGraph(
  raw: unknown,
): Result<CodebaseGraph, ValidationError> {
  let parsedPayload: unknown = raw;

  if (typeof raw === "string") {
    try {
      parsedPayload = JSON.parse(raw);
    } catch (parseError) {
      return {
        success: false,
        error: {
          code: "JSON_PARSE_ERROR",
          message:
            parseError instanceof Error
              ? parseError.message
              : "Failed to parse JSON string payload",
        },
      };
    }
  }

  if (
    typeof parsedPayload !== "object" ||
    parsedPayload === null ||
    !("schemaVersion" in parsedPayload)
  ) {
    return {
      success: false,
      error: {
        code: "SCHEMA_ERROR",
        message: "Invalid payload: missing schemaVersion property",
      },
    };
  }

  const recordPayload = parsedPayload as Record<string, unknown>;
  const version = recordPayload.schemaVersion;

  if (typeof version !== "number" || version !== CURRENT_SCHEMA_VERSION) {
    return {
      success: false,
      error: {
        code: "VERSION_MISMATCH",
        message: `Schema version mismatch. Expected ${CURRENT_SCHEMA_VERSION}, received ${String(
          version,
        )}`,
        expectedVersion: CURRENT_SCHEMA_VERSION,
        receivedVersion: typeof version === "number" ? version : undefined,
      },
    };
  }

  try {
    const validated = codebaseGraphSchema.parse(parsedPayload) as CodebaseGraph;
    return {
      success: true,
      data: validated,
    };
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.issues.map(
        (issue) => `${issue.path.join(".")}: ${issue.message}`,
      );
      return {
        success: false,
        error: {
          code: "SCHEMA_ERROR",
          message: "Payload failed CodebaseGraph schema validation",
          issues,
        },
      };
    }

    return {
      success: false,
      error: {
        code: "SCHEMA_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Unknown validation error occurred during deserialization",
      },
    };
  }
}
