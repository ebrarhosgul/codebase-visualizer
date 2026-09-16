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

  it("resolves path alias @/* to root when compilerOptions.paths maps @/* to ./*", () => {
    const tsconfig = `{
      // TypeScript configuration with comments
      "compilerOptions": {
        "baseUrl": ".",
        "paths": {
          "@/*": ["./*"],
        },
      },
    }`;

    const files: ExtractedFile[] = [
      {
        path: "app/flight/[code]/page.tsx",
        content: `
          import { getFlight } from "@/lib/api";
          import FlightCard from "@/components/flight/flight-card";
          import { Flight } from "@/types";

          export default function Page() {
            const flight = getFlight("TK1984");
            return <FlightCard flight={flight} />;
          }
        `,
        sizeBytes: 300,
      },
      {
        path: "components/flight/flight-card.tsx",
        content: `
          export default function FlightCard({ flight }: { flight: any }) {
            return <div>{flight.code}</div>;
          }
        `,
        sizeBytes: 150,
      },
      {
        path: "lib/api.ts",
        content: `
          export function getFlight(code: string) {
            return { code };
          }
        `,
        sizeBytes: 100,
      },
      {
        path: "types/index.ts",
        content: `
          export interface Flight {
            code: string;
          }
        `,
        sizeBytes: 80,
      },
    ];

    const result = parseRepositoryAst(files, mockRepoInfo, tsconfig);

    // Should NOT create external module pseudo nodes for internal modules
    expect(result.graph.externalModules["ext:@/lib/api"]).toBeUndefined();
    expect(
      result.graph.externalModules["ext:@/components/flight/flight-card"],
    ).toBeUndefined();
    expect(result.graph.externalModules["ext:@/types"]).toBeUndefined();

    // Should create internal edges to the real files
    const edgeApi =
      result.graph.edges[
        "edge:file:app/flight/[code]/page.tsx->file:lib/api.ts:file_import"
      ];
    expect(edgeApi).toBeDefined();
    expect(edgeApi?.isExternal).toBe(false);

    const edgeCard =
      result.graph.edges[
        "edge:file:app/flight/[code]/page.tsx->file:components/flight/flight-card.tsx:file_import"
      ];
    expect(edgeCard).toBeDefined();
    expect(edgeCard?.isExternal).toBe(false);

    const edgeTypes =
      result.graph.edges[
        "edge:file:app/flight/[code]/page.tsx->file:types/index.ts:file_import"
      ];
    expect(edgeTypes).toBeDefined();
    expect(edgeTypes?.isExternal).toBe(false);
  });

  it("extracts path aliases from tsconfig.json in files list when tsconfigContent argument is omitted", () => {
    const files: ExtractedFile[] = [
      {
        path: "tsconfig.json",
        content: JSON.stringify({
          compilerOptions: {
            paths: {
              "@/*": ["./*"],
            },
          },
        }),
        sizeBytes: 80,
      },
      {
        path: "app/page.tsx",
        content: `
          import { helper } from "@/lib/helper";
          export default function Home() { return <div>{helper()}</div>; }
        `,
        sizeBytes: 120,
      },
      {
        path: "lib/helper.ts",
        content: "export function helper() { return 'ok'; }",
        sizeBytes: 50,
      },
    ];

    const result = parseRepositoryAst(files, mockRepoInfo);

    expect(result.graph.externalModules["ext:@/lib/helper"]).toBeUndefined();
    const edge =
      result.graph.edges[
        "edge:file:app/page.tsx->file:lib/helper.ts:file_import"
      ];
    expect(edge).toBeDefined();
    expect(edge?.isExternal).toBe(false);
  });

  it("resolves TSX local imports between project files and creates file and symbol dependency edges", () => {
    const files: ExtractedFile[] = [
      {
        path: "src/components/button.tsx",
        content: `
          import React from "react";
          export interface ButtonProps {
            label: string;
          }
          export function Button({ label }: ButtonProps) {
            return <button>{label}</button>;
          }
          export default Button;
        `,
        sizeBytes: 250,
      },
      {
        path: "src/components/card.tsx",
        content: `
          import React from "react";
          import Button, { ButtonProps } from "./button";
          import { Check } from "lucide-react";
          export function Card() {
            return <div><Button label="Click" /></div>;
          }
        `,
        sizeBytes: 240,
      },
      {
        path: "src/components/index.ts",
        content: `
          export { Button } from "./button";
          export { Card } from "./card";
        `,
        sizeBytes: 90,
      },
    ];

    const result = parseRepositoryAst(files, mockRepoInfo);

    // Files exist
    const buttonFile = result.graph.files["file:src/components/button.tsx"];
    const cardFile = result.graph.files["file:src/components/card.tsx"];
    const indexFile = result.graph.files["file:src/components/index.ts"];

    expect(buttonFile).toBeDefined();
    expect(cardFile).toBeDefined();
    expect(indexFile).toBeDefined();

    // Symbols exist in button.tsx
    const buttonSymId = "symbol:src/components/button.tsx#Button";
    const buttonPropsSymId = "symbol:src/components/button.tsx#ButtonProps";
    expect(result.graph.symbols[buttonSymId]).toBeDefined();
    expect(result.graph.symbols[buttonPropsSymId]).toBeDefined();

    // External module stub created for lucide-react
    expect(result.graph.externalModules["ext:lucide-react"]).toBeDefined();
    // Internal files are NOT external
    expect(result.graph.externalModules["ext:./button"]).toBeUndefined();

    // File-to-file edge from card.tsx to button.tsx
    const cardToButtonFileEdge =
      result.graph.edges[
        "edge:file:src/components/card.tsx->file:src/components/button.tsx:file_import"
      ];
    expect(cardToButtonFileEdge).toBeDefined();
    expect(cardToButtonFileEdge?.isExternal).toBe(false);

    // Symbol edge from card.tsx to Button symbol
    const cardToButtonSymEdge =
      result.graph.edges[
        "edge:file:src/components/card.tsx->symbol:src/components/button.tsx#Button:file_import"
      ];
    expect(cardToButtonSymEdge).toBeDefined();
    expect(cardToButtonSymEdge?.isExternal).toBe(false);

    // Symbol edge from card.tsx to ButtonProps symbol
    const cardToButtonPropsSymEdge =
      result.graph.edges[
        "edge:file:src/components/card.tsx->symbol:src/components/button.tsx#ButtonProps:file_import"
      ];
    expect(cardToButtonPropsSymEdge).toBeDefined();
    expect(cardToButtonPropsSymEdge?.isExternal).toBe(false);

    // External edge from card.tsx to lucide-react
    const cardToLucideEdge =
      result.graph.edges[
        "edge:file:src/components/card.tsx->ext:lucide-react:file_import"
      ];
    expect(cardToLucideEdge).toBeDefined();
    expect(cardToLucideEdge?.isExternal).toBe(true);

    // Re-export edges from index.ts
    const indexToButtonFileEdge =
      result.graph.edges[
        "edge:file:src/components/index.ts->file:src/components/button.tsx:re_export"
      ];
    expect(indexToButtonFileEdge).toBeDefined();
    expect(indexToButtonFileEdge?.isExternal).toBe(false);

    const indexToButtonSymEdge =
      result.graph.edges[
        "edge:file:src/components/index.ts->symbol:src/components/button.tsx#Button:re_export"
      ];
    expect(indexToButtonSymEdge).toBeDefined();
    expect(indexToButtonSymEdge?.isExternal).toBe(false);

    // Verify importIds and exportIds
    expect(cardFile?.importIds).toContain("file:src/components/button.tsx");
    expect(cardFile?.importIds).toContain(buttonSymId);
    expect(cardFile?.importIds).toContain("ext:lucide-react");
  });
});
