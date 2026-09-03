import { z } from "zod";

/**
 * Zod schema for source code position and range coordinates.
 * Coordinates are 1 indexed for lines and columns, zero indexed for byte/character offsets.
 */
export const sourceLocationSchema = z.object({
  startLine: z
    .number()
    .int()
    .positive({ message: "startLine must be a 1 indexed positive integer" }),
  startColumn: z
    .number()
    .int()
    .positive({ message: "startColumn must be a 1 indexed positive integer" }),
  endLine: z
    .number()
    .int()
    .positive({ message: "endLine must be a 1 indexed positive integer" }),
  endColumn: z
    .number()
    .int()
    .positive({ message: "endColumn must be a 1 indexed positive integer" }),
  startOffset: z
    .number()
    .int()
    .nonnegative({
      message: "startOffset must be a zero indexed non negative integer",
    }),
  endOffset: z
    .number()
    .int()
    .nonnegative({
      message: "endOffset must be a zero indexed non negative integer",
    }),
});

/**
 * Source code coordinates covering line, column, and character offsets.
 * Direct mapping to Monaco Editor ranges and permalinks.
 */
export type SourceLocation = Readonly<z.infer<typeof sourceLocationSchema>>;

/**
 * Creates a SourceLocation object validating all coordinate constraints.
 */
export function createSourceLocation(location: SourceLocation): SourceLocation {
  return sourceLocationSchema.parse(location);
}
