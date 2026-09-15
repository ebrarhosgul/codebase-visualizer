import { ts } from "ts-morph";

/**
 * Mapping of path alias patterns to directory prefixes.
 * Supports a single directory prefix or an ordered list of fallback prefixes.
 */
export interface PathAliasMap {
  readonly [aliasPrefix: string]: string | readonly string[];
}

/**
 * Parses JSON content tolerant of comments and trailing commas.
 */
function parseTsconfigJson(content: string): {
  compilerOptions?: {
    baseUrl?: string;
    paths?: Record<string, string[] | string>;
  };
} | null {
  try {
    const parsedByTs = ts.parseConfigFileTextToJson("tsconfig.json", content);
    if (parsedByTs.config && typeof parsedByTs.config === "object") {
      return parsedByTs.config as {
        compilerOptions?: {
          baseUrl?: string;
          paths?: Record<string, string[] | string>;
        };
      };
    }
  } catch {
    // Continue to regex sanitizer
  }

  try {
    const sanitized = content
      .replace(/^\uFEFF/, "")
      .replace(/\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/,\s*([\]}])/g, "$1");
    return JSON.parse(sanitized) as {
      compilerOptions?: {
        baseUrl?: string;
        paths?: Record<string, string[] | string>;
      };
    };
  } catch {
    return null;
  }
}

/**
 * Extracts compilerOptions.paths and baseUrl from tsconfig.json content.
 * Defaults to mapping "@/*" to "src/*" and root if not provided.
 */
export function extractPathAliases(tsconfigJson?: string): PathAliasMap {
  const defaultAliases: Record<string, string> = {
    "@/": "src/",
  };

  if (!tsconfigJson) {
    return defaultAliases;
  }

  const parsed = parseTsconfigJson(tsconfigJson);
  if (!parsed?.compilerOptions) {
    return defaultAliases;
  }

  const compilerOptions = parsed.compilerOptions;
  const paths = compilerOptions.paths;
  if (!paths) {
    return defaultAliases;
  }

  const aliases: Record<string, string | readonly string[]> = {};
  const baseUrl = (compilerOptions.baseUrl || ".")
    .replace(/^\.\/?/, "")
    .replace(/\/+$/, "");

  for (const [pattern, targetListOrString] of Object.entries(paths)) {
    const targetList = Array.isArray(targetListOrString)
      ? targetListOrString
      : [targetListOrString];

    if (targetList.length === 0) {
      continue;
    }

    const cleanPattern = pattern.replace(/\*$/, "");
    const resolvedTargets: string[] = [];

    for (const target of targetList) {
      if (typeof target !== "string") {
        continue;
      }

      // Strip wildcard asterisk (e.g. "@/*" -> "@/", "./src/*" -> "src/")
      let cleanTarget = target.replace(/\*$/, "").replace(/^\.\/?/, "");

      if (baseUrl && !cleanTarget.startsWith(baseUrl)) {
        cleanTarget = `${baseUrl}/${cleanTarget}`.replace(/^\/+/, "");
      }

      if (
        cleanPattern.endsWith("/") &&
        cleanTarget.length > 0 &&
        !cleanTarget.endsWith("/")
      ) {
        cleanTarget = `${cleanTarget}/`;
      }

      resolvedTargets.push(cleanTarget);
    }

    if (resolvedTargets.length === 1) {
      aliases[cleanPattern] = resolvedTargets[0] ?? "";
    } else if (resolvedTargets.length > 1) {
      aliases[cleanPattern] = resolvedTargets;
    }
  }

  return Object.keys(aliases).length > 0 ? aliases : defaultAliases;
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
 * Searches candidate file paths with extension matching and extension swapping.
 */
function findMatchingFilePath(
  targetPath: string,
  existingFilePaths: ReadonlySet<string>,
): string | undefined {
  const cleanPath = targetPath.replace(/^\/+/, "");

  // 1. Direct match with candidates
  for (const ext of EXTENSION_CANDIDATES) {
    const candidate = cleanPath + ext;
    if (existingFilePaths.has(candidate)) {
      return candidate;
    }
  }

  // 2. Extension swap (e.g. ./button.js or ./button.jsx -> ./button.tsx or ./button.ts)
  const stripped = cleanPath.replace(/\.(tsx?|jsx?|mjs|cjs)$/, "");
  if (stripped !== cleanPath) {
    for (const ext of EXTENSION_CANDIDATES) {
      const candidate = stripped + ext;
      if (existingFilePaths.has(candidate)) {
        return candidate;
      }
    }
  }

  return undefined;
}

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

    const match = findMatchingFilePath(normalized, existingFilePaths);
    if (match) {
      return {
        resolvedPath: match,
        isExternal: false,
      };
    }

    // Relative import pointing outside parsed file collection
    return {
      isExternal: true,
      packageName: cleanSpecifier,
    };
  }

  // 2. Path alias mapping (e.g. @/* or ~/*)
  for (const [aliasPattern, targetPrefixOrList] of Object.entries(aliasMap)) {
    if (cleanSpecifier.startsWith(aliasPattern)) {
      const remainder = cleanSpecifier.slice(aliasPattern.length);
      const prefixes = Array.isArray(targetPrefixOrList)
        ? targetPrefixOrList
        : [targetPrefixOrList];

      for (const targetPrefix of prefixes) {
        const aliased = `${targetPrefix}${remainder}`;
        const match = findMatchingFilePath(aliased, existingFilePaths);
        if (match) {
          return {
            resolvedPath: match,
            isExternal: false,
          };
        }
      }

      // If alias is @/ or ~/ and targeted src/ did not match, check root directory fallback
      if (aliasPattern === "@/" || aliasPattern === "~/") {
        const rootMatch = findMatchingFilePath(remainder, existingFilePaths);
        if (rootMatch) {
          return {
            resolvedPath: rootMatch,
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

  // 3. Check if bare non-relative specifier resolves to an internal file (e.g. baseUrl 'src' or root)
  const bareDirectMatch = findMatchingFilePath(
    cleanSpecifier,
    existingFilePaths,
  );
  if (bareDirectMatch) {
    return {
      resolvedPath: bareDirectMatch,
      isExternal: false,
    };
  }

  const bareSrcMatch = findMatchingFilePath(
    `src/${cleanSpecifier}`,
    existingFilePaths,
  );
  if (bareSrcMatch) {
    return {
      resolvedPath: bareSrcMatch,
      isExternal: false,
    };
  }

  // 4. External npm package (e.g. "react", "@xyflow/react", "lodash/get")
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
