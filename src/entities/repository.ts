import { z } from "zod";

/**
 * Current version of the domain graph schema.
 */
export const CURRENT_SCHEMA_VERSION = 1 as const;

/**
 * Zod schema validating a Repository entity.
 */
export const repositorySchema = z.object({
  id: z.string().startsWith("repo:"),
  owner: z.string().min(1),
  name: z.string().min(1),
  fullName: z.string().min(1),
  defaultBranch: z.string().min(1),
  commitSha: z.string().min(1),
  analyzedAt: z.string().datetime({
    message: "analyzedAt must be a valid ISO 8601 datetime string",
  }),
  totalFiles: z.number().int().nonnegative(),
  totalSymbols: z.number().int().nonnegative(),
  languages: z.record(z.string(), z.number().int().nonnegative()),
  schemaVersion: z.number().int().positive(),
});

/**
 * Canonical domain representation of an analyzed code repository.
 */
export type Repository = Readonly<z.infer<typeof repositorySchema>>;

/**
 * Generates a deterministic repository identifier.
 * Format: repo:{owner}/{name}
 */
export function createRepositoryId(owner: string, name: string): string {
  const cleanOwner = owner.trim();
  const cleanName = name.trim();
  return `repo:${cleanOwner}/${cleanName}`;
}
