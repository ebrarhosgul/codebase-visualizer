import { describe, it, expect } from "vitest";
import { parseRepositoryAst } from "../ast-parser";
import type { ExtractedFile, GitHubRepoInfo } from "@/types/ingestion";
import { codebaseGraphSchema } from "@/entities";

describe("parseRepositoryAst", () => {
  const mockRepoInfo: GitHubRepoInfo = {
    owner: "antigravity",
    name: "test-repo",
    fullName: "antigravity/test-repo",
    defaultBranch: "main",
    commitSha: "sha123",
  };

  it("parses source files and creates canonical file, directory, and edge entities", () => {
    const files: ExtractedFile[] = [
      {
        path: "src/index.ts",
        content: `
          import { add } from "./utils/math";
          import React from "react";
          export { add } from "./utils/math";
          export const result = add(1, 2);
        `,
        sizeBytes: 150,
      },
      {
        path: "src/utils/math.ts",
        content: `
          export function add(a: number, b: number): number {
            return a + b;
          }
        `,
        sizeBytes: 90,
      },
    ];

    const result = parseRepositoryAst(files, mockRepoInfo);

    expect(result.graph).toBeDefined();
    // Validates against canonical zod schema
    expect(() => codebaseGraphSchema.parse(result.graph)).not.toThrow();

    // Verify files
    expect(result.graph.files["file:src/index.ts"]).toBeDefined();
    expect(result.graph.files["file:src/utils/math.ts"]).toBeDefined();

    // Verify file sources
    expect(result.fileSources["file:src/index.ts"]).toContain(
      "export const result",
    );

    // Verify external module stub
    expect(result.graph.externalModules["ext:react"]).toBeDefined();

    // Verify import edges
    const internalImportEdge =
      result.graph.edges[
        "edge:file:src/index.ts->file:src/utils/math.ts:file_import"
      ];
    expect(internalImportEdge).toBeDefined();
    expect(internalImportEdge?.isExternal).toBe(false);

    const externalImportEdge =
      result.graph.edges["edge:file:src/index.ts->ext:react:file_import"];
    expect(externalImportEdge).toBeDefined();
    expect(externalImportEdge?.isExternal).toBe(true);

    // Verify re-export edge
    const reExportEdge =
      result.graph.edges[
        "edge:file:src/index.ts->file:src/utils/math.ts:re_export"
      ];
    expect(reExportEdge).toBeDefined();

    // Verify directory structure
    expect(result.graph.directories["dir:"]).toBeDefined();
    expect(result.graph.directories["dir:src"]).toBeDefined();
    expect(result.graph.directories["dir:src/utils"]).toBeDefined();
  });

  it("handles TypeScript syntax errors gracefully without crashing (AC-4)", () => {
    const files: ExtractedFile[] = [
      {
        path: "src/broken.ts",
        content: `
          export const invalid = {;
        `,
        sizeBytes: 40,
      },
    ];

    const result = parseRepositoryAst(files, mockRepoInfo);
    expect(result.graph.files["file:src/broken.ts"]).toBeDefined();
    expect(result.graph.files["file:src/broken.ts"]?.parseError).toBeDefined();
    expect(() => codebaseGraphSchema.parse(result.graph)).not.toThrow();
  });
});
