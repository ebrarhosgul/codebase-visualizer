import { z } from "zod";

/**
 * Zod schema validating a FileNode entity.
 */
export const fileNodeSchema = z.object({
  id: z.string().startsWith("file:"),
  path: z.string().min(1),
  name: z.string().min(1),
  extension: z.string(),
  language: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  lineCount: z.number().int().nonnegative(),
  directoryId: z.string().startsWith("dir:"),
  symbolIds: z.array(z.string()).readonly(),
  importIds: z.array(z.string()).readonly(),
  exportIds: z.array(z.string()).readonly(),
  parseError: z.string().optional(),
});

/**
 * Canonical domain representation of a source file.
 */
export type FileNode = Readonly<z.infer<typeof fileNodeSchema>>;

/**
 * Normalizes a file path by replacing backslashes and trimming leading slashes.
 */
export function normalizeFilePath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^\/+/g, "");
}

/**
 * Generates a deterministic file identifier from a file path.
 * Format: file:{path} (e.g. file:src/entities/file.ts)
 */
export function createFileId(filePath: string): string {
  const normalized = normalizeFilePath(filePath);
  return `file:${normalized}`;
}
