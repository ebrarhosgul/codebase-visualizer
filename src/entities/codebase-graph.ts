import { z } from "zod";
import {
  repositorySchema,
  CURRENT_SCHEMA_VERSION,
  type Repository,
} from "./repository";
import { directoryNodeSchema, type DirectoryNode } from "./directory";
import { fileNodeSchema, type FileNode } from "./file";
import { symbolNodeSchema, type SymbolNode } from "./symbol";
import { externalModuleNodeSchema, type ExternalModuleNode } from "./external";
import { graphEdgeSchema, type GraphEdge } from "./edge";

/**
 * Zod schema validating a canonical CodebaseGraph root container.
 */
export const codebaseGraphSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  repository: repositorySchema,
  directories: z.record(z.string(), directoryNodeSchema),
  files: z.record(z.string(), fileNodeSchema),
  symbols: z.record(z.string(), symbolNodeSchema),
  externalModules: z.record(z.string(), externalModuleNodeSchema),
  edges: z.record(z.string(), graphEdgeSchema),
});

/**
 * Canonical root domain container representing an analyzed repository.
 */
export type CodebaseGraph = Readonly<{
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  repository: Repository;
  directories: Readonly<Record<string, DirectoryNode>>;
  files: Readonly<Record<string, FileNode>>;
  symbols: Readonly<Record<string, SymbolNode>>;
  externalModules: Readonly<Record<string, ExternalModuleNode>>;
  edges: Readonly<Record<string, GraphEdge>>;
}>;

/**
 * Creates an empty CodebaseGraph container initialized with repository metadata.
 */
export function createEmptyCodebaseGraph(
  repository: Repository,
): CodebaseGraph {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    repository,
    directories: Object.freeze({}),
    files: Object.freeze({}),
    symbols: Object.freeze({}),
    externalModules: Object.freeze({}),
    edges: Object.freeze({}),
  };
}
