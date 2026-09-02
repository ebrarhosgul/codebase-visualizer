/**
 * Mapping of path alias patterns to directory prefixes.
 */
export interface PathAliasMap {
  readonly [aliasPrefix: string]: string;
}

/**
 * Extracts compilerOptions.paths and baseUrl from tsconfig.json content.
 * Defaults to mapping "@/*" to "src/*" if not provided.
 */
export function extractPathAliases(tsconfigJson?: string): PathAliasMap {
  const defaultAliases: Record<string, string> = {
    "@/": "src/",
  };

  if (!tsconfigJson) {
    return defaultAliases;
  }

  try {
    // Basic JSON comments removal if present in tsconfig
    const sanitized = tsconfigJson
      .replace(/\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    const parsed = JSON.parse(sanitized) as {
      compilerOptions?: {
        baseUrl?: string;
        paths?: Record<string, string[]>;
      };
    };

    const compilerOptions = parsed.compilerOptions;
    if (!compilerOptions?.paths) {
      return defaultAliases;
    }

    const aliases: Record<string, string> = {};
    const baseUrl = (compilerOptions.baseUrl || ".")
      .replace(/^\.\/?/, "")
      .replace(/\/+$/, "");

    for (const [pattern, targetList] of Object.entries(compilerOptions.paths)) {
      if (!targetList || targetList.length === 0) {
        continue;
      }

      const target = targetList[0] ?? "";
      // Strip wildcard asterisk (e.g. "@/*" -> "@/", "./src/*" -> "src/")
      const cleanPattern = pattern.replace(/\*$/, "");
      let cleanTarget = target.replace(/\*$/, "").replace(/^\.\/?/, "");

      if (baseUrl && !cleanTarget.startsWith(baseUrl)) {
        cleanTarget = `${baseUrl}/${cleanTarget}`.replace(/^\/+/, "");
      }

      aliases[cleanPattern] = cleanTarget;
    }

    return Object.keys(aliases).length > 0 ? aliases : defaultAliases;
  } catch {
    return defaultAliases;
  }
}

/**
 * Normalizes relative path segments like "." and "..".
 */
export function normalizeRelativePath(
  baseDir: string,
  relativePath: string,
): string {
  const parts = baseDir ? baseDir.split("/").filter(Boolean) : [];
  const segments = relativePath.split("/").filter(Boolean);

  for (const segment of segments) {
    if (segment === ".") {
      continue;
    }
    if (segment === "..") {
      parts.pop();
    } else {
      parts.push(segment);
    }
  }

  return parts.join("/");
}

export interface ResolvedImport {
  readonly resolvedPath?: string;
  readonly isExternal: boolean;
  readonly packageName?: string;
}

const EXTENSION_CANDIDATES = [
  "",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  "/index.ts",
  "/index.tsx",
  "/index.js",
  "/index.jsx",
];

/**
 * Resolves an imported module specifier to either an existing internal file path
 * or an external package name.
 */
export function resolveModuleSpecifier(
  specifier: string,
  importingFilePath: string,
  aliasMap: PathAliasMap,
  existingFilePaths: ReadonlySet<string>,
): ResolvedImport {
  const cleanSpecifier = specifier.trim();

  // 1. Relative import (./ or ../)
  if (cleanSpecifier.startsWith("./") || cleanSpecifier.startsWith("../")) {
    const segments = importingFilePath.split("/");
    segments.pop(); // Remove file name, keep directory
    const baseDir = segments.join("/");
    const normalized = normalizeRelativePath(baseDir, cleanSpecifier);

    for (const ext of EXTENSION_CANDIDATES) {
      const candidate = normalized + ext;
      if (existingFilePaths.has(candidate)) {
        return {
          resolvedPath: candidate,
          isExternal: false,
        };
      }
    }

    // Relative import pointing outside parsed file collection
    return {
      isExternal: true,
      packageName: cleanSpecifier,
    };
  }

  // 2. Path alias mapping (e.g. @/* or ~/*)
  for (const [aliasPattern, targetPrefix] of Object.entries(aliasMap)) {
    if (cleanSpecifier.startsWith(aliasPattern)) {
      const remainder = cleanSpecifier.slice(aliasPattern.length);
      const aliased = `${targetPrefix}${remainder}`;

      for (const ext of EXTENSION_CANDIDATES) {
        const candidate = aliased + ext;
        if (existingFilePaths.has(candidate)) {
          return {
            resolvedPath: candidate,
            isExternal: false,
          };
        }
      }

      // Aliased import pointing to file outside parsed collection
      return {
        isExternal: true,
        packageName: cleanSpecifier,
      };
    }
  }

  // 3. External npm package (e.g. "react", "@xyflow/react", "lodash/get")
  let packageName = cleanSpecifier;
  if (cleanSpecifier.startsWith("@")) {
    // Scoped package e.g. @radix-ui/react-dialog
    const parts = cleanSpecifier.split("/");
    packageName = parts.slice(0, 2).join("/");
  } else {
    // Unscoped package e.g. lodash/get -> lodash
    packageName = cleanSpecifier.split("/")[0] ?? cleanSpecifier;
  }

  return {
    isExternal: true,
    packageName,
  };
}
