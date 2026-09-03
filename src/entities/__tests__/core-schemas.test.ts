import { describe, it, expect } from "vitest";
import {
  sourceLocationSchema,
  createSourceLocation,
  type SourceLocation,
} from "../source-location";
import {
  repositorySchema,
  createRepositoryId,
  CURRENT_SCHEMA_VERSION,
  type Repository,
} from "../repository";
import {
  externalModuleNodeSchema,
  createExternalModuleId,
  type ExternalModuleNode,
} from "../external";
import {
  directoryNodeSchema,
  createDirectoryId,
  normalizeDirectoryPath,
  type DirectoryNode,
} from "../directory";
import {
  fileNodeSchema,
  createFileId,
  normalizeFilePath,
  type FileNode,
} from "../file";
import {
  symbolNodeSchema,
  createSymbolId,
  createAnonymousSymbolId,
  createDefaultExportSymbolId,
  type SymbolNode,
} from "../symbol";

describe("Core Entity Schemas and Deterministic IDs", () => {
  describe("SourceLocation (AC-1, AC-5)", () => {
    it("validates 1 indexed lines and columns with zero indexed offsets", () => {
      const validLocation: SourceLocation = {
        startLine: 1,
        startColumn: 1,
        endLine: 10,
        endColumn: 25,
        startOffset: 0,
        endOffset: 250,
      };

      const parsed = createSourceLocation(validLocation);
      expect(parsed).toEqual(validLocation);
    });

    it("rejects invalid zero or negative lines and columns", () => {
      expect(() =>
        sourceLocationSchema.parse({
          startLine: 0,
          startColumn: 1,
          endLine: 10,
          endColumn: 25,
          startOffset: 0,
          endOffset: 250,
        }),
      ).toThrow();

      expect(() =>
        sourceLocationSchema.parse({
          startLine: 1,
          startColumn: -1,
          endLine: 10,
          endColumn: 25,
          startOffset: 0,
          endOffset: 250,
        }),
      ).toThrow();
    });

    it("rejects negative offsets", () => {
      expect(() =>
        sourceLocationSchema.parse({
          startLine: 1,
          startColumn: 1,
          endLine: 2,
          endColumn: 1,
          startOffset: -5,
          endOffset: 10,
        }),
      ).toThrow();
    });
  });

  describe("Repository (AC-1, AC-2)", () => {
    it("creates deterministic repository ID", () => {
      const id = createRepositoryId("facebook", "react");
      expect(id).toBe("repo:facebook/react");
    });

    it("validates a complete Repository entity", () => {
      const repo: Repository = {
        id: createRepositoryId("vercel", "next.js"),
        owner: "vercel",
        name: "next.js",
        fullName: "vercel/next.js",
        defaultBranch: "canary",
        commitSha: "a1b2c3d4e5f6",
        analyzedAt: "2026-09-02T19:00:00.000Z",
        totalFiles: 420,
        totalSymbols: 1530,
        languages: { TypeScript: 85, JavaScript: 15 },
        schemaVersion: CURRENT_SCHEMA_VERSION,
      };

      const parsed = repositorySchema.parse(repo);
      expect(parsed.id).toBe("repo:vercel/next.js");
      expect(parsed.schemaVersion).toBe(1);
    });

    it("rejects repository with invalid datetime or missing required fields", () => {
      expect(() =>
        repositorySchema.parse({
          id: "repo:test/repo",
          owner: "test",
          name: "repo",
          fullName: "test/repo",
          defaultBranch: "main",
          commitSha: "123",
          analyzedAt: "not-a-datetime",
          totalFiles: 1,
          totalSymbols: 1,
          languages: {},
          schemaVersion: 1,
        }),
      ).toThrow();
    });
  });

  describe("ExternalModuleNode (AC-1, AC-2, AC-4)", () => {
    it("creates deterministic external module ID and validates entity", () => {
      const id = createExternalModuleId("react");
      expect(id).toBe("ext:react");

      const scopedId = createExternalModuleId("@xyflow/react");
      expect(scopedId).toBe("ext:@xyflow/react");

      const externalNode: ExternalModuleNode = {
        id: scopedId,
        name: "@xyflow/react",
        isExternal: true,
      };

      const parsed = externalModuleNodeSchema.parse(externalNode);
      expect(parsed.isExternal).toBe(true);
    });
  });

  describe("DirectoryNode (AC-1, AC-2, AC-3)", () => {
    it("normalizes directory paths and formats deterministic IDs", () => {
      expect(normalizeDirectoryPath("///src/entities///")).toBe("src/entities");
      expect(normalizeDirectoryPath("")).toBe("");
      expect(createDirectoryId("src/entities")).toBe("dir:src/entities");
      expect(createDirectoryId("")).toBe("dir:");
    });

    it("validates a DirectoryNode and links to children", () => {
      const dir: DirectoryNode = {
        id: createDirectoryId("src/entities"),
        path: "src/entities",
        name: "entities",
        parentDirId: createDirectoryId("src"),
        childDirIds: [],
        childFileIds: [createFileId("src/entities/file.ts")],
      };

      const parsed = directoryNodeSchema.parse(dir);
      expect(parsed.childFileIds).toHaveLength(1);
      expect(parsed.parentDirId).toBe("dir:src");
    });
  });

  describe("FileNode (AC-1, AC-2, AC-3)", () => {
    it("normalizes file paths and formats deterministic IDs", () => {
      expect(normalizeFilePath("/src/app/page.tsx")).toBe("src/app/page.tsx");
      expect(createFileId("src/app/page.tsx")).toBe("file:src/app/page.tsx");
    });

    it("validates a FileNode entity with symbol and import references", () => {
      const file: FileNode = {
        id: createFileId("src/utils/math.ts"),
        path: "src/utils/math.ts",
        name: "math.ts",
        extension: ".ts",
        language: "typescript",
        sizeBytes: 1024,
        lineCount: 45,
        directoryId: createDirectoryId("src/utils"),
        symbolIds: [createSymbolId("src/utils/math.ts", "add")],
        importIds: [],
        exportIds: [createSymbolId("src/utils/math.ts", "add")],
      };

      const parsed = fileNodeSchema.parse(file);
      expect(parsed.id).toBe("file:src/utils/math.ts");
      expect(parsed.symbolIds[0]).toBe("symbol:src/utils/math.ts#add");
    });
  });

  describe("SymbolNode (AC-1, AC-2, AC-5)", () => {
    const defaultRange: SourceLocation = {
      startLine: 10,
      startColumn: 1,
      endLine: 15,
      endColumn: 2,
      startOffset: 120,
      endOffset: 200,
    };

    it("creates deterministic symbol IDs for named, anonymous, and default export declarations", () => {
      expect(createSymbolId("src/auth/service.ts", "loginUser")).toBe(
        "symbol:src/auth/service.ts#loginUser",
      );

      expect(createDefaultExportSymbolId("src/app.tsx")).toBe(
        "symbol:src/app.tsx#default",
      );

      expect(createAnonymousSymbolId("src/utils.ts", "format", 42, 12)).toBe(
        "symbol:src/utils.ts#format$anon@L42C12",
      );

      expect(createAnonymousSymbolId("src/utils.ts", null, 50, 5)).toBe(
        "symbol:src/utils.ts#$anon@L50C5",
      );
    });

    it("validates a complete SymbolNode entity", () => {
      const symbol: SymbolNode = {
        id: createSymbolId("src/service.ts", "UserService.getUser"),
        fileId: createFileId("src/service.ts"),
        parentSymbolId: createSymbolId("src/service.ts", "UserService"),
        name: "getUser",
        kind: "method",
        range: defaultRange,
        selectionRange: {
          startLine: 10,
          startColumn: 9,
          endLine: 10,
          endColumn: 16,
          startOffset: 128,
          endOffset: 135,
        },
        isExported: true,
        isDefaultExport: false,
        signature: "public getUser(id: string): Promise<User>",
        documentation: "Fetches user record by ID.",
        visibility: "public",
        childSymbolIds: [],
      };

      const parsed = symbolNodeSchema.parse(symbol);
      expect(parsed.kind).toBe("method");
      expect(parsed.visibility).toBe("public");
      expect(parsed.id).toBe("symbol:src/service.ts#UserService.getUser");
    });
  });
});
