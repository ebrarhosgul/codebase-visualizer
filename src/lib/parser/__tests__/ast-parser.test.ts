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

  it("does not report parseError on valid TypeScript files importing uninstalled modules or referencing globals", () => {
    const files: ExtractedFile[] = [
      {
        path: "src/airportApi.ts",
        content: `
          import { AirportResponse } from '@/types';
          import { MOCK_AIRPORTS } from '@/mocks/airports';

          export async function getAirportDetails(icaoCode: string) {
            if (process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true') {
              return MOCK_AIRPORTS[icaoCode] || null;
            }
            return null;
          }
        `,
        sizeBytes: 300,
      },
    ];

    const result = parseRepositoryAst(files, mockRepoInfo);
    const fileNode = result.graph.files["file:src/airportApi.ts"];
    expect(fileNode).toBeDefined();
    expect(fileNode?.parseError).toBeUndefined();
  });

  it("extracts top level functions, classes, interfaces, and types into canonical SymbolNodes (AC-5)", () => {
    const files: ExtractedFile[] = [
      {
        path: "src/calculator.ts",
        content: `
          export interface CalculatorConfig {
            precision: number;
          }

          export type NumberOrString = number | string;

          export enum Operation {
            Add = "ADD",
            Subtract = "SUBTRACT"
          }

          /**
           * Adds two numbers together.
           */
          export function calculateSum(a: number, b: number): number {
            return a + b;
          }

          export class Calculator {
            public compute(op: Operation): number {
              return 42;
            }
          }
        `,
        sizeBytes: 500,
      },
    ];

    const result = parseRepositoryAst(files, mockRepoInfo);
    expect(() => codebaseGraphSchema.parse(result.graph)).not.toThrow();

    const fileNode = result.graph.files["file:src/calculator.ts"];
    expect(fileNode).toBeDefined();
    expect(fileNode?.symbolIds.length).toBeGreaterThanOrEqual(5);

    // Verify function
    const fnSymbol =
      result.graph.symbols["symbol:src/calculator.ts#calculateSum"];
    expect(fnSymbol).toBeDefined();
    expect(fnSymbol?.kind).toBe("function");
    expect(fnSymbol?.isExported).toBe(true);
    expect(fnSymbol?.range.startLine).toBeGreaterThan(1);
    expect(fnSymbol?.documentation).toContain("Adds two numbers together.");

    // Verify interface
    const ifaceSymbol =
      result.graph.symbols["symbol:src/calculator.ts#CalculatorConfig"];
    expect(ifaceSymbol).toBeDefined();
    expect(ifaceSymbol?.kind).toBe("interface");

    // Verify type alias
    const typeSymbol =
      result.graph.symbols["symbol:src/calculator.ts#NumberOrString"];
    expect(typeSymbol).toBeDefined();
    expect(typeSymbol?.kind).toBe("type_alias");

    // Verify enum
    const enumSymbol =
      result.graph.symbols["symbol:src/calculator.ts#Operation"];
    expect(enumSymbol).toBeDefined();
    expect(enumSymbol?.kind).toBe("enum");

    // Verify class and method
    const classSymbol =
      result.graph.symbols["symbol:src/calculator.ts#Calculator"];
    expect(classSymbol).toBeDefined();
    expect(classSymbol?.kind).toBe("class");
    expect(classSymbol?.childSymbolIds.length).toBe(1);

    const methodSymbol =
      result.graph.symbols["symbol:src/calculator.ts#Calculator.compute"];
    expect(methodSymbol).toBeDefined();
    expect(methodSymbol?.kind).toBe("method");
    expect(methodSymbol?.parentSymbolId).toBe(classSymbol?.id);
  });

  it("invokes onProgress callback with file index, total count, and file path (covers: AC-4)", () => {
    const files: ExtractedFile[] = [
      {
        path: "src/one.ts",
        content: "export const one = 1;",
        sizeBytes: 25,
      },
      {
        path: "src/two.ts",
        content: "export const two = 2;",
        sizeBytes: 25,
      },
    ];

    const progressCalls: Array<{
      current: number;
      total: number;
      name: string;
    }> = [];

    parseRepositoryAst(
      files,
      mockRepoInfo,
      undefined,
      (current, total, name) => {
        progressCalls.push({ current, total, name });
      },
    );

    expect(progressCalls).toHaveLength(2);
    expect(progressCalls[0]).toEqual({
      current: 1,
      total: 2,
      name: "src/one.ts",
    });
    expect(progressCalls[1]).toEqual({
      current: 2,
      total: 2,
      name: "src/two.ts",
    });
  });
});
