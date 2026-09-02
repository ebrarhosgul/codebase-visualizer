import { z } from "zod";

/**
 * Zod schema validating an ExternalModuleNode entity.
 */
export const externalModuleNodeSchema = z.object({
  id: z.string().startsWith("ext:"),
  name: z.string().min(1),
  isExternal: z.literal(true),
});

/**
 * Canonical domain representation of an external dependency package.
 */
export type ExternalModuleNode = Readonly<
  z.infer<typeof externalModuleNodeSchema>
>;

/**
 * Generates a deterministic external module identifier.
 * Format: ext:{packageName} (e.g. ext:react, ext:next/server)
 */
export function createExternalModuleId(packageName: string): string {
  const cleanPackage = packageName.trim();
  return `ext:${cleanPackage}`;
}
