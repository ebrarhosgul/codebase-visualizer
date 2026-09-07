import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  createRepositoryKey,
  createRepoKey,
  calculateRecordByteSize,
  getCachedRepository,
  saveCachedRepository,
  deleteCachedRepository,
  clearAllCachedRepositories,
  getAllCachedRepositorySummaries,
  openDatabase,
  STORE_NAME,
  type CachedRepositoryRecord,
} from "../indexed-db";
import type { CodebaseGraph } from "@/entities";
import { CURRENT_SCHEMA_VERSION } from "@/entities";

// Helper to create valid mock CodebaseGraph
function createMockGraph(
  repoName = "react",
  owner = "facebook",
): CodebaseGraph {
  return {
    repository: {
      id: `repo:${owner}/${repoName}`,
      owner,
      name: repoName,
      fullName: `${owner}/${repoName}`,
      defaultBranch: "main",
      commitSha: "sha123456",
      analyzedAt: new Date().toISOString(),
      totalFiles: 1,
      totalSymbols: 0,
      languages: { typescript: 1 },
      schemaVersion: CURRENT_SCHEMA_VERSION,
    },
    files: {
      "file:index.ts": {
        id: "file:index.ts",
        path: "index.ts",
        name: "index.ts",
        extension: ".ts",
        language: "typescript",
        sizeBytes: 120,
        lineCount: 10,
        directoryId: "dir:",
        symbolIds: [],
        importIds: [],
        exportIds: [],
      },
    },
    directories: {},
    symbols: {},
    externalModules: {},
    edges: {},
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}

// In-memory IndexedDB mock for unit testing store transactions
function createMockIndexedDB() {
  const storeData = new Map<string, CachedRepositoryRecord>();

  const mockStore = {
    get: (key: string) => {
      const req: {
        result?: CachedRepositoryRecord;
        onsuccess: null | (() => void);
        onerror: null | (() => void);
      } = {
        result: storeData.get(key),
        onsuccess: null,
        onerror: null,
      };
      setTimeout(() => req.onsuccess?.(), 0);
      return req;
    },
    getAll: () => {
      const req: {
        result: CachedRepositoryRecord[];
        onsuccess: null | (() => void);
        onerror: null | (() => void);
      } = {
        result: Array.from(storeData.values()),
        onsuccess: null,
        onerror: null,
      };
      setTimeout(() => req.onsuccess?.(), 0);
      return req;
    },
    put: (record: CachedRepositoryRecord) => {
      storeData.set(record.id, record);
      const req: {
        onsuccess: null | (() => void);
        onerror: null | (() => void);
      } = {
        onsuccess: null,
        onerror: null,
      };
      setTimeout(() => req.onsuccess?.(), 0);
      return req;
    },
    delete: (key: string) => {
      storeData.delete(key);
      const req: {
        onsuccess: null | (() => void);
        onerror: null | (() => void);
      } = {
        onsuccess: null,
        onerror: null,
      };
      setTimeout(() => req.onsuccess?.(), 0);
      return req;
    },
    clear: () => {
      storeData.clear();
      const req: {
        onsuccess: null | (() => void);
        onerror: null | (() => void);
      } = {
        onsuccess: null,
        onerror: null,
      };
      setTimeout(() => req.onsuccess?.(), 0);
      return req;
    },
  };

  const mockDb = {
    objectStoreNames: {
      contains: (name: string) => name === STORE_NAME,
    },
    createObjectStore: () => ({
      createIndex: vi.fn(),
    }),
    transaction: () => ({
      objectStore: () => mockStore,
    }),
  };

  const open = () => {
    const req: {
      result: typeof mockDb;
      error: null;
      onsuccess: null | (() => void);
      onerror: null | (() => void);
      onupgradeneeded:
        null | ((ev: { target: { result: typeof mockDb } }) => void);
      onblocked: null | (() => void);
    } = {
      result: mockDb,
      error: null,
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
      onblocked: null,
    };
    setTimeout(() => {
      req.onupgradeneeded?.({ target: { result: mockDb } });
      req.onsuccess?.();
    }, 0);
    return req;
  };

  return {
    open,
    storeData,
  };
}

describe("IndexedDB storage helper", () => {
  it("creates repository key correctly (covers: AC-1)", () => {
    const key = createRepositoryKey("facebook", "react", "main");
    expect(key).toBe("facebook/react:main");
  });

  it("creates repo grouping key correctly (covers: AC-1)", () => {
    const key = createRepoKey("facebook", "react");
    expect(key).toBe("facebook/react");
  });

  it("calculates byte size of records accurately (covers: AC-7)", () => {
    const size = calculateRecordByteSize({ hello: "world" });
    expect(size).toBeGreaterThan(0);
  });

  it("returns null safely when indexedDB is undefined (covers: AC-1)", async () => {
    const originalIndexedDB = window.indexedDB;
    // @ts-expect-error test undefined environment
    delete window.indexedDB;

    const db = await openDatabase();
    expect(db).toBeNull();

    window.indexedDB = originalIndexedDB;
  });

  describe("database operations with mock IndexedDB", () => {
    let mockIdb: ReturnType<typeof createMockIndexedDB>;
    const originalIndexedDB = window.indexedDB;

    beforeEach(() => {
      mockIdb = createMockIndexedDB();
      // @ts-expect-error assign mock open
      window.indexedDB = { open: mockIdb.open };
    });

    afterEach(() => {
      window.indexedDB = originalIndexedDB;
    });

    it("saves and retrieves a cached repository record (covers: AC-1)", async () => {
      const graph = createMockGraph("react", "facebook");
      const fileSources = { "file:index.ts": "const x = 1;" };

      const saved = await saveCachedRepository({
        owner: "facebook",
        repo: "react",
        branch: "main",
        commitSha: "sha123456",
        graph,
        fileSources,
      });

      expect(saved).not.toBeNull();
      expect(saved?.id).toBe("facebook/react:main");
      expect(saved?.commitSha).toBe("sha123456");

      const retrieved = await getCachedRepository("facebook", "react", "main");
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe("facebook/react:main");
      expect(retrieved?.fileSources["file:index.ts"]).toBe("const x = 1;");
      expect(retrieved?.nodeCount).toBeGreaterThan(0);
    });

    it("silently evicts record with outdated schemaVersion (covers: AC-9)", async () => {
      const graph = createMockGraph("react", "facebook");
      // Pre-populate with schemaVersion: 999
      mockIdb.storeData.set("facebook/react:main", {
        id: "facebook/react:main",
        repoKey: "facebook/react",
        owner: "facebook",
        repo: "react",
        branch: "main",
        commitSha: "sha123456",
        schemaVersion: 999,
        graph,
        fileSources: {},
        nodeCount: 1,
        edgeCount: 0,
        fileCount: 1,
        byteSize: 500,
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
      });

      const retrieved = await getCachedRepository("facebook", "react", "main");
      expect(retrieved).toBeNull();
      // Corrupted record should be removed from store
      expect(mockIdb.storeData.has("facebook/react:main")).toBe(false);
    });

    it("silently evicts record with invalid graph structure (covers: AC-9)", async () => {
      // Pre-populate with invalid graph payload
      mockIdb.storeData.set("facebook/react:main", {
        id: "facebook/react:main",
        repoKey: "facebook/react",
        owner: "facebook",
        repo: "react",
        branch: "main",
        commitSha: "sha123456",
        schemaVersion: CURRENT_SCHEMA_VERSION,
        // @ts-expect-error invalid graph
        graph: { corrupted: true },
        fileSources: {},
        nodeCount: 1,
        edgeCount: 0,
        fileCount: 1,
        byteSize: 500,
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
      });

      const retrieved = await getCachedRepository("facebook", "react", "main");
      expect(retrieved).toBeNull();
      expect(mockIdb.storeData.has("facebook/react:main")).toBe(false);
    });

    it("enforces LRU eviction when exceeding max 10 repositories (covers: AC-7)", async () => {
      const graph = createMockGraph();

      // Seed 10 repositories with staggered lastAccessedAt
      for (let i = 1; i <= 10; i++) {
        await saveCachedRepository({
          owner: "test",
          repo: `repo-${i}`,
          branch: "main",
          commitSha: `sha-${i}`,
          graph,
          fileSources: {},
          createdAt: 1000 * i,
        });
        // Mutate lastAccessedAt to guarantee predictable order
        const rec = mockIdb.storeData.get(`test/repo-${i}:main`);
        if (rec) {
          mockIdb.storeData.set(`test/repo-${i}:main`, {
            ...rec,
            lastAccessedAt: 1000 * i,
          });
        }
      }

      expect(mockIdb.storeData.size).toBe(10);
      expect(mockIdb.storeData.has("test/repo-1:main")).toBe(true);

      // Now insert 11th repository
      await saveCachedRepository({
        owner: "test",
        repo: "repo-11",
        branch: "main",
        commitSha: "sha-11",
        graph,
        fileSources: {},
      });

      // Total count should remain at 10
      expect(mockIdb.storeData.size).toBe(10);
      // repo-1 (oldest accessed) should have been evicted
      expect(mockIdb.storeData.has("test/repo-1:main")).toBe(false);
      // repo-11 should be present
      expect(mockIdb.storeData.has("test/repo-11:main")).toBe(true);
    });

    it("lists summaries and deletes a repository (covers: AC-1)", async () => {
      const graph = createMockGraph("vue", "vuejs");
      await saveCachedRepository({
        owner: "vuejs",
        repo: "vue",
        branch: "main",
        commitSha: "vue-sha",
        graph,
        fileSources: {},
      });

      const summaries = await getAllCachedRepositorySummaries();
      expect(summaries.length).toBe(1);
      expect(summaries[0].repoKey).toBe("vuejs/vue");

      await deleteCachedRepository("vuejs", "vue", "main");
      expect(mockIdb.storeData.size).toBe(0);

      const afterDelete = await getAllCachedRepositorySummaries();
      expect(afterDelete.length).toBe(0);
    });

    it("clears all cached repositories (covers: AC-1)", async () => {
      const graph = createMockGraph();
      await saveCachedRepository({
        owner: "a",
        repo: "b",
        branch: "main",
        commitSha: "sha-1",
        graph,
        fileSources: {},
      });
      await saveCachedRepository({
        owner: "c",
        repo: "d",
        branch: "main",
        commitSha: "sha-2",
        graph,
        fileSources: {},
      });

      expect(mockIdb.storeData.size).toBe(2);
      await clearAllCachedRepositories();
      expect(mockIdb.storeData.size).toBe(0);
    });
  });
});
