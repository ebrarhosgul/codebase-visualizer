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

export const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);

export const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".bmp",
  ".tiff",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".otf",
  ".zip",
  ".tar",
  ".gz",
  ".7z",
  ".rar",
  ".mp4",
  ".mp3",
  ".webm",
  ".mov",
  ".wav",
  ".pdf",
  ".exe",
  ".dll",
  ".dylib",
  ".so",
]);

/**
 * Checks if a relative file path matches supported source code extensions.
 */
export function isSourceFile(path: string): boolean {
  if (
    path.endsWith(".d.ts") ||
    path.endsWith(".d.cts") ||
    path.endsWith(".d.mts")
  ) {
    return false;
  }

  const dotIndex = path.lastIndexOf(".");
  if (dotIndex === -1) {
    return false;
  }

  const ext = path.slice(dotIndex).toLowerCase();
  return SOURCE_EXTENSIONS.has(ext);
}

/**
 * Checks if a file path is a known binary format.
 */
export function isBinaryFile(path: string): boolean {
  const dotIndex = path.lastIndexOf(".");
  if (dotIndex === -1) {
    return false;
  }
  const ext = path.slice(dotIndex).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}
