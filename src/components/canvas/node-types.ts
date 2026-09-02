import { FileNodeCard } from "./file-node-card";
import { SymbolNodeCard } from "./symbol-node-card";

/**
 * Standard React Flow node types dictionary mapping domain entity types to card components.
 */
export const codebaseNodeTypes = {
  file: FileNodeCard,
  directory: FileNodeCard,
  symbol: SymbolNodeCard,
  external: FileNodeCard,
} as const;
