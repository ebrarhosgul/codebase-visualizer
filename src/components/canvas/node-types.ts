import { FileNodeCard } from "./file-node-card";
import { SymbolNodeCard } from "./symbol-node-card";
import { FolderGroupNode } from "./folder-group-node";
import { CollapsedFolderNode } from "./collapsed-folder-node";

/**
 * Standard React Flow node types dictionary mapping domain entity types to card components.
 */
export const codebaseNodeTypes = {
  file: FileNodeCard,
  directory: FileNodeCard,
  symbol: SymbolNodeCard,
  external: FileNodeCard,
  folderGroup: FolderGroupNode,
  collapsedFolder: CollapsedFolderNode,
} as const;
