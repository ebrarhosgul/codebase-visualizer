import { z } from "zod";

/**
 * Zod schema validating a DirectoryNode entity.
 */
export const directoryNodeSchema = z.object({
  id: z.string().startsWith("dir:"),
  path: z.string(),
  name: z.string(),
  parentDirId: z.string().nullable(),
  childDirIds: z.array(z.string()).readonly(),
  childFileIds: z.array(z.string()).readonly(),
});

/**
 * Canonical domain representation of a directory in the repository hierarchy.
 */
export type DirectoryNode = Readonly<z.infer<typeof directoryNodeSchema>>;

/**
 * Normalizes a directory path by replacing backslashes and trimming leading/trailing slashes.
 */
export function normalizeDirectoryPath(dirPath: string): string {
  return dirPath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

/**
 * Generates a deterministic directory identifier from a directory path.
 * Format: dir:{path} (e.g. dir:src/entities, or dir: for repository root)
 */
export function createDirectoryId(dirPath: string): string {
  const normalized = normalizeDirectoryPath(dirPath);
  return `dir:${normalized}`;
}
