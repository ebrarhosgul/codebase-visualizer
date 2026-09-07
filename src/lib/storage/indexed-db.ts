import { CURRENT_SCHEMA_VERSION, type CodebaseGraph } from "@/entities";
import { deserializeCodebaseGraph } from "@/entities/serialization";

export const DB_NAME = "codebase_visualizer_cache_v1";
export const STORE_NAME = "repositories";
export const DB_VERSION = 1;

export const MAX_CACHED_REPOSITORIES = 10;
export const MAX_CACHE_BYTES = 300 * 1024 * 1024; // 300 megabytes

export interface CachedRepositoryRecord {
  readonly id: string;
  readonly repoKey: string;
  readonly owner: string;
  readonly repo: string;
  readonly branch: string;
  readonly commitSha: string;
  readonly schemaVersion: number;
  readonly graph: CodebaseGraph;
  readonly fileSources: Readonly<Record<string, string>>;
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly fileCount: number;
  readonly byteSize: number;
  readonly createdAt: number;
  readonly lastAccessedAt: number;
}

export interface CachedRepositorySummary {
  readonly id: string;
  readonly repoKey: string;
  readonly owner: string;
  readonly repo: string;
  readonly branch: string;
  readonly commitSha: string;
  readonly schemaVersion: number;
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly fileCount: number;
  readonly byteSize: number;
  readonly createdAt: number;
  readonly lastAccessedAt: number;
}

export interface SaveRepositoryParams {
  readonly owner: string;
  readonly repo: string;
  readonly branch: string;
  readonly commitSha: string;
  readonly graph: CodebaseGraph;
  readonly fileSources: Readonly<Record<string, string>>;
  readonly createdAt?: number;
}

/**
 * Creates canonical repository primary key formatted as owner/repo:branch.
 */
export function createRepositoryKey(
  owner: string,
  repo: string,
  branch: string,
): string {
  return `${owner.trim()}/${repo.trim()}:${branch.trim()}`;
}

/**
 * Creates repository grouping key formatted as owner/repo.
 */
export function createRepoKey(owner: string, repo: string): string {
  return `${owner.trim()}/${repo.trim()}`;
}

/**
 * Calculates byte size of a JSON serializable record safely across browser and node runtimes.
 */
export function calculateRecordByteSize(payload: unknown): number {
  try {
    const jsonString = JSON.stringify(payload);
    if (typeof Blob !== "undefined") {
      return new Blob([jsonString]).size;
    }
    if (typeof Buffer !== "undefined") {
      return Buffer.byteLength(jsonString, "utf8");
    }
    return jsonString.length;
  } catch {
    return 0;
  }
}

/**
 * Safely opens IndexedDB database with canonical object stores and indexes.
 * Returns null if running in environments without IndexedDB support (such as server side rendering).
 */
export function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") {
    return Promise.resolve(null);
  }

  return new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("by_last_accessed", "lastAccessedAt", {
            unique: false,
          });
          store.createIndex("by_repo", "repoKey", { unique: false });
          store.createIndex("by_commit", "commitSha", { unique: false });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error);
      };

      request.onblocked = () => {
        resolve(null);
      };
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Retrieves a cached repository record by owner, repo, and branch.
 * Verifies canonical schema version and deserializes graph. Silently evicts corrupted or outdated records.
 */
export async function getCachedRepository(
  owner: string,
  repo: string,
  branch: string,
): Promise<CachedRepositoryRecord | null> {
  const db = await openDatabase();
  if (!db) {
    return null;
  }

  const key = createRepositoryKey(owner, repo, branch);

  return new Promise((resolve) => {
    try {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const getRequest = store.get(key);

      getRequest.onsuccess = () => {
        const record = getRequest.result as CachedRepositoryRecord | undefined;
        if (!record) {
          resolve(null);
          return;
        }

        // Schema version check and corruption validation (AC-9)
        if (record.schemaVersion !== CURRENT_SCHEMA_VERSION) {
          store.delete(key);
          resolve(null);
          return;
        }

        const validation = deserializeCodebaseGraph(record.graph);
        if (!validation.success) {
          store.delete(key);
          resolve(null);
          return;
        }

        // Touch last accessed timestamp for accurate LRU tracking
        const updatedRecord: CachedRepositoryRecord = {
          ...record,
          lastAccessedAt: Date.now(),
        };
        store.put(updatedRecord);
        resolve(updatedRecord);
      };

      getRequest.onerror = () => {
        resolve(null);
      };
    } catch {
      resolve(null);
    }
  });
}

/**
 * Stores or updates a repository graph in IndexedDB.
 * Enforces max 10 repositories and 300 megabytes quota with least recently used eviction in an atomic transaction.
 */
export async function saveCachedRepository(
  params: SaveRepositoryParams,
): Promise<CachedRepositoryRecord | null> {
  const db = await openDatabase();
  if (!db) {
    return null;
  }

  const key = createRepositoryKey(params.owner, params.repo, params.branch);
  const repoKey = createRepoKey(params.owner, params.repo);

  const nodeCount =
    Object.keys(params.graph.files).length +
    Object.keys(params.graph.directories).length +
    Object.keys(params.graph.symbols).length;
  const edgeCount = Object.keys(params.graph.edges).length;
  const fileCount = Object.keys(params.fileSources).length;

  const byteSize = calculateRecordByteSize({
    graph: params.graph,
    fileSources: params.fileSources,
  });

  const now = Date.now();
  const recordToSave: CachedRepositoryRecord = {
    id: key,
    repoKey,
    owner: params.owner,
    repo: params.repo,
    branch: params.branch,
    commitSha: params.commitSha,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    graph: params.graph,
    fileSources: params.fileSources,
    nodeCount,
    edgeCount,
    fileCount,
    byteSize,
    createdAt: params.createdAt ?? now,
    lastAccessedAt: now,
  };

  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);

      const getAllRequest = store.getAll();

      getAllRequest.onsuccess = () => {
        const existingRecords = (getAllRequest.result ||
          []) as CachedRepositoryRecord[];

        // Filter out existing record with same key so we evaluate replacement correctly
        const otherRecords = existingRecords.filter((r) => r.id !== key);

        // Sort other records by lastAccessedAt ascending (oldest first for LRU eviction)
        otherRecords.sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);

        let currentCount = otherRecords.length + 1; // plus the one we are about to save
        let totalBytes =
          otherRecords.reduce((sum, r) => sum + r.byteSize, 0) + byteSize;

        // Evict oldest records until count <= MAX_CACHED_REPOSITORIES and totalBytes <= MAX_CACHE_BYTES (AC-7)
        while (
          (currentCount > MAX_CACHED_REPOSITORIES ||
            totalBytes > MAX_CACHE_BYTES) &&
          otherRecords.length > 0
        ) {
          const oldest = otherRecords.shift();
          if (oldest) {
            store.delete(oldest.id);
            currentCount -= 1;
            totalBytes -= oldest.byteSize;
          }
        }

        const putRequest = store.put(recordToSave);
        putRequest.onsuccess = () => {
          resolve(recordToSave);
        };
        putRequest.onerror = () => {
          reject(putRequest.error);
        };
      };

      getAllRequest.onerror = () => {
        reject(getAllRequest.error);
      };
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Deletes a repository record from IndexedDB cache.
 */
export async function deleteCachedRepository(
  owner: string,
  repo: string,
  branch: string,
): Promise<void> {
  const db = await openDatabase();
  if (!db) {
    return;
  }

  const key = createRepositoryKey(owner, repo, branch);

  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const deleteRequest = store.delete(key);

      deleteRequest.onsuccess = () => resolve();
      deleteRequest.onerror = () => reject(deleteRequest.error);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Clears all cached repository records from IndexedDB.
 */
export async function clearAllCachedRepositories(): Promise<void> {
  const db = await openDatabase();
  if (!db) {
    return;
  }

  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const clearRequest = store.clear();

      clearRequest.onsuccess = () => resolve();
      clearRequest.onerror = () => reject(clearRequest.error);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Returns lightweight summaries of all cached repositories for inventory and management.
 */
export async function getAllCachedRepositorySummaries(): Promise<
  readonly CachedRepositorySummary[]
> {
  const db = await openDatabase();
  if (!db) {
    return [];
  }

  return new Promise((resolve) => {
    try {
      const transaction = db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const getAllRequest = store.getAll();

      getAllRequest.onsuccess = () => {
        const records = (getAllRequest.result ||
          []) as CachedRepositoryRecord[];
        const summaries: CachedRepositorySummary[] = records.map((r) => ({
          id: r.id,
          repoKey: r.repoKey,
          owner: r.owner,
          repo: r.repo,
          branch: r.branch,
          commitSha: r.commitSha,
          schemaVersion: r.schemaVersion,
          nodeCount: r.nodeCount,
          edgeCount: r.edgeCount,
          fileCount: r.fileCount,
          byteSize: r.byteSize,
          createdAt: r.createdAt,
          lastAccessedAt: r.lastAccessedAt,
        }));
        resolve(Object.freeze(summaries));
      };

      getAllRequest.onerror = () => {
        resolve([]);
      };
    } catch {
      resolve([]);
    }
  });
}
