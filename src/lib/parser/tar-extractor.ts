import { Readable } from "node:stream";
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

export interface TarExtractorOptions {
  readonly maxFiles?: number;
  readonly includeNonSourceFiles?: boolean;
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

      const totalFilesFound = discoveredFiles.length;
      const wasCapped = totalFilesFound > maxFiles;
      const files = discoveredFiles.slice(0, maxFiles);

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

    extract.on("error", (err) => {
      reject(new Error(`Failed to extract repository archive: ${err.message}`));
    });

    readable.pipe(gunzip).pipe(extract);
  });
}
