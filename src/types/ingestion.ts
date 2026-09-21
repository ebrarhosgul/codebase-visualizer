import type { Repository, CodebaseGraph } from "@/entities";

/**
 * Lifecycle phases for repository ingestion and parsing.
 */
export type IngestionPhase =
  | "idle"
  | "validating"
  | "downloading_archive"
  | "unpacking_files"
  | "parsing_ast"
  | "complete"
  | "error";

/**
 * Granular details streamed during item-by-item processing (e.g. unpacking or parsing).
 */
export interface IngestProgressDetail {
  readonly currentItem: number;
  readonly totalItems?: number;
  readonly currentItemName?: string;
}

/**
 * Payload sent by client to initiate repository ingestion.
 */
export interface IngestRequest {
  readonly repositoryUrl: string;
  readonly branch?: string;
  readonly githubToken?: string;
  readonly cachedCommitSha?: string;
  readonly forceFresh?: boolean;
}

/**
 * Known error classification codes for ingestion failures.
 */
export type IngestErrorCode =
  | "INVALID_URL"
  | "REPO_NOT_FOUND"
  | "RATE_LIMITED"
  | "TOO_MANY_REQUESTS"
  | "FILE_LIMIT_EXCEEDED"
  | "PARSE_FAILED"
  | "TIMEOUT"
  | "ABORTED";

/**
 * Structured ingestion error details.
 */
export interface IngestError {
  readonly code: IngestErrorCode;
  readonly message: string;
  readonly rateLimitReset?: number;
}

/**
 * Progress payload streamed during ingestion phases.
 */
export interface IngestProgress {
  readonly phase: IngestionPhase;
  readonly current: number;
  readonly total: number;
  readonly message: string;
  readonly detail?: IngestProgressDetail;
}

/**
 * Final result produced upon successful ingestion and analysis.
 */
export interface IngestResult {
  readonly repository: Repository;
  readonly graph: CodebaseGraph;
  readonly fileSources: Readonly<Record<string, string>>;
}

/**
 * Server Sent Event chunk format streamed from POST /api/ingest.
 */
export interface IngestStreamEvent {
  readonly phase: IngestionPhase;
  readonly progress?: IngestProgress;
  readonly result?: IngestResult;
  readonly error?: IngestError;
  readonly cached?: boolean;
  readonly commitSha?: string;
  readonly message?: string;
  readonly fileCount?: number;
  readonly nodeCount?: number;
}

/**
 * In memory representation of a source file extracted from tar archive.
 */
export interface ExtractedFile {
  readonly path: string;
  readonly content: string;
  readonly sizeBytes: number;
}

/**
 * Result of unpacking a repository tar archive in memory.
 */
export interface ArchiveExtractionResult {
  readonly files: readonly ExtractedFile[];
  readonly tsconfigContent?: string;
  readonly totalFilesFound: number;
  readonly wasCapped: boolean;
}

/**
 * Metadata resolved for a public GitHub repository.
 */
export interface GitHubRepoInfo {
  readonly owner: string;
  readonly name: string;
  readonly fullName: string;
  readonly defaultBranch: string;
  readonly commitSha: string;
  readonly description?: string;
}
