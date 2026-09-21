import { Readable, Transform } from "node:stream";
import { createGunzip } from "node:zlib";
import tar from "tar-stream";
import type { ArchiveExtractionResult, ExtractedFile } from "@/types/ingestion";

import {
  SOURCE_EXTENSIONS,
  BINARY_EXTENSIONS,
  isSourceFile,
  isBinaryFile,
} from "@/entities";
export { SOURCE_EXTENSIONS, BINARY_EXTENSIONS, isSourceFile, isBinaryFile };

const IGNORED_DIRECTORY_PREFIXES = [
  "node_modules/",
  ".git/",
  ".next/",
  "dist/",
  "build/",
  "coverage/",
  ".turbo/",
  ".github/",
  ".vscode/",
];

const MAX_INDIVIDUAL_FILE_BYTES = 1024 * 1024; // 1 MB limit per file

/**
 * Resource bounds applied while the archive streams, before content is kept in
 * memory. Highly compressible archives (many paths carrying the same large
 * file) can otherwise expand far beyond what was downloaded.
 */
export const MAX_DECOMPRESSED_BYTES = 512 * 1024 * 1024; // 512 MB of tar data
export const MAX_RETAINED_FILES = 5000;
export const MAX_RETAINED_BYTES = 64 * 1024 * 1024; // 64 MB of file content

/**
 * Computes a priority score based on directory depth.
 * Root files have depth 0, src/ files have depth 1, nested files have higher scores.
 */
export function calculateFileDepthScore(filePath: string): number {
  const segments = filePath.split("/");
  const depth = segments.length - 1;

  if (depth === 0) {
    return 0;
  }

  const isSrc = segments[0] === "src";
  if (isSrc) {
    return depth;
  }

  return depth + 0.5;
}

/**
 * Strips the GitHub tarball root folder name (e.g. "facebook-react-1234abc/src/index.ts" -> "src/index.ts").
 */
export function stripTarballRootFolder(rawPath: string): string {
  const slashIndex = rawPath.indexOf("/");
  if (slashIndex === -1) {
    return "";
  }
  return rawPath.slice(slashIndex + 1);
}

export interface TarExtractorLimits {
  readonly maxDecompressedBytes: number;
  readonly maxRetainedFiles: number;
  readonly maxRetainedBytes: number;
}

const DEFAULT_LIMITS: TarExtractorLimits = {
  maxDecompressedBytes: MAX_DECOMPRESSED_BYTES,
  maxRetainedFiles: MAX_RETAINED_FILES,
  maxRetainedBytes: MAX_RETAINED_BYTES,
};

export interface TarExtractorOptions {
  readonly maxFiles?: number;
  readonly includeNonSourceFiles?: boolean;
  /** Overrides the default resource bounds; intended for tests. */
  readonly limits?: Partial<TarExtractorLimits>;
  readonly onProgress?: (
    processedCount: number,
    currentFilePath: string,
  ) => void;
}

/**
 * In memory extractor that unpacks a gzipped repository tar archive,
 * captures tsconfig.json, and selects up to maxFiles source files prioritizing shallowest depth.
 */
export async function unpackRepositoryTarball(
  archiveBuffer: ArrayBuffer,
  maxFilesOrOptions: number | TarExtractorOptions = 100,
): Promise<ArchiveExtractionResult> {
  const maxFiles =
    typeof maxFilesOrOptions === "number"
      ? maxFilesOrOptions
      : (maxFilesOrOptions.maxFiles ?? 100);
  const includeNonSource =
    typeof maxFilesOrOptions === "object"
      ? (maxFilesOrOptions.includeNonSourceFiles ?? false)
      : false;
  const onProgress =
    typeof maxFilesOrOptions === "object"
      ? maxFilesOrOptions.onProgress
      : undefined;
  const limits: TarExtractorLimits = {
    ...DEFAULT_LIMITS,
    ...(typeof maxFilesOrOptions === "object" ? maxFilesOrOptions.limits : {}),
  };

  return new Promise<ArchiveExtractionResult>((resolve, reject) => {
    const extract = tar.extract();
    const gunzip = createGunzip();
    const rawBuffer =
      archiveBuffer instanceof ArrayBuffer
        ? Buffer.from(archiveBuffer)
        : Buffer.from(new Uint8Array(archiveBuffer));
    const readable = Readable.from(rawBuffer);

    const discoveredFiles: ExtractedFile[] = [];
    let tsconfigContent: string | undefined;
    let eligibleFileCount = 0;
    let retainedBytes = 0;
    let decompressedBytes = 0;

    // Aborts extraction once the expanded archive passes the size bound.
    const decompressionGuard = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        decompressedBytes += chunk.length;
        if (decompressedBytes > limits.maxDecompressedBytes) {
          callback(
            new Error(
              `Repository archive expands beyond ${Math.round(limits.maxDecompressedBytes / (1024 * 1024))} MB.`,
            ),
          );
          return;
        }
        callback(null, chunk);
      },
    });

    extract.on("entry", (header, stream, next) => {
      const strippedPath = stripTarballRootFolder(header.name);

      // Skip root folder itself or empty paths
      if (!strippedPath || header.type !== "file") {
        stream.resume();
        next();
        return;
      }

      // Skip ignored directories
      const isIgnored = IGNORED_DIRECTORY_PREFIXES.some((prefix) =>
        strippedPath.startsWith(prefix),
      );
      if (isIgnored) {
        stream.resume();
        next();
        return;
      }

      // Check for tsconfig.json / jsconfig.json
      const isTsConfig =
        strippedPath === "tsconfig.json" ||
        strippedPath === "jsconfig.json" ||
        strippedPath.endsWith("/tsconfig.json") ||
        strippedPath.endsWith("/jsconfig.json");

      const isSource = isSourceFile(strippedPath);
      const isBinary = isBinaryFile(strippedPath);

      if (!isTsConfig && !isSource && (!includeNonSource || isBinary)) {
        stream.resume();
        next();
        return;
      }

      // File size limit defense
      if (header.size && header.size > MAX_INDIVIDUAL_FILE_BYTES) {
        stream.resume();
        next();
        return;
      }

      const countsTowardResult = isSource || (includeNonSource && !isTsConfig);

      // Count every eligible file so totalFilesFound stays accurate, but stop
      // keeping content once the retention budget is spent.
      if (countsTowardResult) {
        eligibleFileCount += 1;
        const headerSize = header.size ?? 0;
        if (
          discoveredFiles.length >= limits.maxRetainedFiles ||
          retainedBytes + headerSize > limits.maxRetainedBytes
        ) {
          stream.resume();
          next();
          return;
        }
        retainedBytes += headerSize;
      }

      const chunks: Buffer[] = [];

      stream.on("data", (chunk: unknown) => {
        if (Buffer.isBuffer(chunk)) {
          chunks.push(chunk);
        } else if (typeof chunk === "string") {
          chunks.push(Buffer.from(chunk, "utf8"));
        } else if (chunk instanceof Uint8Array) {
          chunks.push(Buffer.from(chunk));
        }
      });

      stream.on("end", () => {
        const fullBuffer = Buffer.concat(chunks);
        const textContent = fullBuffer.toString("utf8");

        if (
          isTsConfig &&
          (!tsconfigContent || strippedPath === "tsconfig.json")
        ) {
          tsconfigContent = textContent;
        }

        if (isSource || (includeNonSource && !isTsConfig && !isBinary)) {
          discoveredFiles.push({
            path: strippedPath,
            content: textContent,
            sizeBytes: fullBuffer.byteLength,
          });
          onProgress?.(discoveredFiles.length, strippedPath);
        }

        next();
      });

      stream.on("error", (err) => {
        next(err);
      });
    });

    extract.on("finish", () => {
      // Sort files prioritizing source code and shallowest directory depth (root and src/ first)
      discoveredFiles.sort((a, b) => {
        const isASource = isSourceFile(a.path);
        const isBSource = isSourceFile(b.path);
        if (isASource !== isBSource) {
          return isASource ? -1 : 1;
        }
        const scoreA = calculateFileDepthScore(a.path);
        const scoreB = calculateFileDepthScore(b.path);
        if (scoreA !== scoreB) {
          return scoreA - scoreB;
        }
        return a.path.localeCompare(b.path);
      });

      const totalFilesFound = eligibleFileCount;
      const files = discoveredFiles.slice(0, maxFiles);
      // Capped by maxFiles or by the retention bounds: some eligible files were dropped
      const wasCapped = totalFilesFound > files.length;

      resolve({
        files: Object.freeze(files),
        ...(tsconfigContent ? { tsconfigContent } : {}),
        totalFilesFound,
        wasCapped,
      });
    });

    gunzip.on("error", (err) => {
      reject(
        new Error(`Failed to decompress repository archive: ${err.message}`),
      );
    });

    decompressionGuard.on("error", (err) => {
      readable.destroy();
      gunzip.destroy();
      extract.destroy();
      reject(err);
    });

    extract.on("error", (err) => {
      reject(new Error(`Failed to extract repository archive: ${err.message}`));
    });

    readable.pipe(gunzip).pipe(decompressionGuard).pipe(extract);
  });
}
