import { z } from "zod";
import { sourceLocationSchema, type SourceLocation } from "./source-location";
import { normalizeFilePath } from "./file";

export const symbolKindSchema = z.enum([
  "function",
  "method",
  "class",
  "interface",
  "type_alias",
  "variable",
  "enum",
]);

export type SymbolKind = z.infer<typeof symbolKindSchema>;

export const symbolVisibilitySchema = z.enum([
  "public",
  "protected",
  "private",
]);

export type SymbolVisibility = z.infer<typeof symbolVisibilitySchema>;

/**
 * Zod schema validating a SymbolNode entity.
 */
export const symbolNodeSchema = z.object({
  id: z.string().startsWith("symbol:"),
  fileId: z.string().startsWith("file:"),
  parentSymbolId: z.string().nullable(),
  name: z.string(),
  kind: symbolKindSchema,
  range: sourceLocationSchema,
  selectionRange: sourceLocationSchema,
  isExported: z.boolean(),
  isDefaultExport: z.boolean(),
  signature: z.string(),
  documentation: z.string().nullable(),
  visibility: symbolVisibilitySchema,
  childSymbolIds: z.array(z.string()).readonly(),
});

/**
 * Canonical domain representation of an abstract syntax tree symbol declaration.
 */
export type SymbolNode = Readonly<{
  id: string;
  fileId: string;
  parentSymbolId: string | null;
  name: string;
  kind: SymbolKind;
  range: SourceLocation;
  selectionRange: SourceLocation;
  isExported: boolean;
  isDefaultExport: boolean;
  signature: string;
  documentation: string | null;
  visibility: SymbolVisibility;
  childSymbolIds: readonly string[];
}>;

/**
 * Generates a deterministic symbol identifier for a named symbol declaration.
 * Format: symbol:{filePath}#{symbolScopedName}
 */
export function createSymbolId(
  filePath: string,
  symbolScopedName: string,
): string {
  const normalized = normalizeFilePath(filePath);
  const cleanScopedName = symbolScopedName.trim();
  return `symbol:${normalized}#${cleanScopedName}`;
}

/**
 * Generates a deterministic symbol identifier for an anonymous declaration with coordinate anchors.
 * Format: symbol:{filePath}#{parentScope}$anon@L{line}C{col}
 * If no parent scope: symbol:{filePath}#$anon@L{line}C{col}
 */
export function createAnonymousSymbolId(
  filePath: string,
  parentScope: string | null,
  line: number,
  column: number,
): string {
  const normalized = normalizeFilePath(filePath);
  const scopePrefix = parentScope ? `${parentScope.trim()}$` : "$";
  return `symbol:${normalized}#${scopePrefix}anon@L${line}C${column}`;
}

/**
 * Generates a deterministic symbol identifier for an unnamed default export.
 * Format: symbol:{filePath}#default
 */
export function createDefaultExportSymbolId(filePath: string): string {
  const normalized = normalizeFilePath(filePath);
  return `symbol:${normalized}#default`;
}
