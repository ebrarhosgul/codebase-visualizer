import { Project } from "ts-morph";
import {
  type CodebaseGraph,
  type DirectoryNode,
  type FileNode,
  type ExternalModuleNode,
  type GraphEdge,
  type Repository,
  createRepositoryId,
  createDirectoryId,
  createFileId,
  createExternalModuleId,
  createGraphEdge,
  aggregateEdge,
  codebaseGraphSchema,
  CURRENT_SCHEMA_VERSION,
} from "@/entities";
import type { ExtractedFile, GitHubRepoInfo } from "@/types/ingestion";
import { extractPathAliases, resolveModuleSpecifier } from "./path-alias";

export interface ParsedCodebaseData {
  readonly graph: CodebaseGraph;
  readonly fileSources: Readonly<Record<string, string>>;
}

/**
 * Determines file language from extension.
 */
function getLanguageFromPath(path: string): string {
  if (path.endsWith(".ts") || path.endsWith(".tsx")) {
    return "typescript";
  }
  if (
    path.endsWith(".js") ||
    path.endsWith(".jsx") ||
    path.endsWith(".mjs") ||
    path.endsWith(".cjs")
  ) {
    return "javascript";
  }
  return "text";
}

/**
 * Builds the hierarchical DirectoryNode tree from a collection of file paths.
 */
function buildDirectoryHierarchy(
  filePaths: readonly string[],
): Record<string, DirectoryNode> {
  const dirMap: Record<
    string,
    {
      id: string;
      path: string;
      name: string;
      parentDirId: string | null;
      childDirIds: Set<string>;
      childFileIds: Set<string>;
    }
  > = {};

  // Ensure root directory exists
  const rootId = createDirectoryId("");
  dirMap[""] = {
    id: rootId,
    path: "",
    name: "",
    parentDirId: null,
    childDirIds: new Set<string>(),
    childFileIds: new Set<string>(),
  };

  for (const filePath of filePaths) {
    const segments = filePath.split("/");
    const fileId = createFileId(filePath);

    // If file is at root
    if (segments.length === 1) {
      dirMap[""]?.childFileIds.add(fileId);
      continue;
    }

    // Process each directory along the path
    let currentPath = "";
    let parentPath = "";

    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i] ?? "";
      parentPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;

      if (!dirMap[currentPath]) {
        const parentId = createDirectoryId(parentPath);
        const dirId = createDirectoryId(currentPath);

        dirMap[currentPath] = {
          id: dirId,
          path: currentPath,
          name: segment,
          parentDirId: parentId,
          childDirIds: new Set<string>(),
          childFileIds: new Set<string>(),
        };

        // Link parent to this child directory
        dirMap[parentPath]?.childDirIds.add(dirId);
      }
    }

    // Link innermost directory to this file
    dirMap[currentPath]?.childFileIds.add(fileId);
  }

  // Freeze into canonical DirectoryNode records
  const result: Record<string, DirectoryNode> = {};
  for (const d of Object.values(dirMap)) {
    result[d.id] = {
      id: d.id,
      path: d.path,
      name: d.name,
      parentDirId: d.parentDirId,
      childDirIds: Object.freeze(Array.from(d.childDirIds).sort()),
      childFileIds: Object.freeze(Array.from(d.childFileIds).sort()),
    };
  }

  return result;
}

/**
 * In memory abstract syntax tree parser using ts-morph to construct
 * canonical files, directories, external stubs, and import/re-export edges.
 */
export function parseRepositoryAst(
  files: readonly ExtractedFile[],
  repoInfo: GitHubRepoInfo,
  tsconfigContent?: string,
): ParsedCodebaseData {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      allowJs: true,
      jsx: 1, // Preserve
    },
  });

  const existingFilePaths = new Set<string>();
  const fileSources: Record<string, string> = {};

  for (const file of files) {
    project.createSourceFile(file.path, file.content, { overwrite: true });
    existingFilePaths.add(file.path);
  }

  const aliasMap = extractPathAliases(tsconfigContent);
  const directoryNodes = buildDirectoryHierarchy(Array.from(existingFilePaths));

  const fileNodes: Record<string, FileNode> = {};
  const externalModules: Record<string, ExternalModuleNode> = {};
  const edges: Record<string, GraphEdge> = {};

  const languageCounts: Record<string, number> = {};

  for (const file of files) {
    const fileId = createFileId(file.path);
    fileSources[fileId] = file.content;

    const sourceFile = project.getSourceFile(file.path);
    const lineCount = file.content.split("\n").length;
    const language = getLanguageFromPath(file.path);
    languageCounts[language] = (languageCounts[language] || 0) + 1;

    // Get parent directory ID
    const segments = file.path.split("/");
    const dirPath = segments.length > 1 ? segments.slice(0, -1).join("/") : "";
    const directoryId = createDirectoryId(dirPath);

    let parseError: string | undefined;
    if (sourceFile) {
      try {
        const diagnostics = sourceFile.getPreEmitDiagnostics();
        const syntaxErrors = diagnostics.filter((d) => d.getCategory() === 1); // 1 = Error
        if (syntaxErrors.length > 0) {
          const firstMsg = syntaxErrors[0]?.getMessageText();
          parseError =
            typeof firstMsg === "string"
              ? firstMsg
              : "Syntax error detected in file.";
        }
      } catch {
        // Tolerant of diagnostic failures
      }
    }

    const fileNode: FileNode = {
      id: fileId,
      path: file.path,
      name: segments[segments.length - 1] ?? file.path,
      extension: file.path.includes(".")
        ? `.${file.path.split(".").pop()}`
        : "",
      language,
      sizeBytes: file.sizeBytes,
      lineCount,
      directoryId,
      symbolIds: Object.freeze([]),
      importIds: Object.freeze([]),
      exportIds: Object.freeze([]),
      ...(parseError ? { parseError } : {}),
    };

    fileNodes[fileId] = fileNode;

    if (!sourceFile) {
      continue;
    }

    // 1. Process Import Declarations
    try {
      const importDeclarations = sourceFile.getImportDeclarations();
      for (const importDecl of importDeclarations) {
        const moduleSpecifier = importDecl.getModuleSpecifierValue();
        if (!moduleSpecifier) {
          continue;
        }

        const importSpecifiers: string[] = [];
        const defaultImport = importDecl.getDefaultImport();
        if (defaultImport) {
          importSpecifiers.push(defaultImport.getText());
        }
        for (const named of importDecl.getNamedImports()) {
          importSpecifiers.push(named.getName());
        }
        const namespaceImport = importDecl.getNamespaceImport();
        if (namespaceImport) {
          importSpecifiers.push(`* as ${namespaceImport.getText()}`);
        }

        const resolved = resolveModuleSpecifier(
          moduleSpecifier,
          file.path,
          aliasMap,
          existingFilePaths,
        );

        let targetId: string;
        let isExternal = false;

        if (resolved.resolvedPath && !resolved.isExternal) {
          targetId = createFileId(resolved.resolvedPath);
        } else {
          const pkgName = resolved.packageName || moduleSpecifier;
          targetId = createExternalModuleId(pkgName);
          isExternal = true;

          if (!externalModules[targetId]) {
            externalModules[targetId] = {
              id: targetId,
              name: pkgName,
              isExternal: true,
            };
          }
        }

        const edgeKind = "file_import";
        const candidateEdge = createGraphEdge({
          sourceId: fileId,
          targetId,
          kind: edgeKind,
          isExternal,
          metadata:
            importSpecifiers.length > 0 ? { importSpecifiers } : undefined,
        });

        if (edges[candidateEdge.id]) {
          edges[candidateEdge.id] = aggregateEdge(edges[candidateEdge.id]!, {
            importSpecifiers,
            weightIncrement: 1,
          });
        } else {
          edges[candidateEdge.id] = candidateEdge;
        }
      }
    } catch {
      // Graceful tolerance for import parsing issues
    }

    // 2. Process Export Declarations with module specifiers (re-exports)
    try {
      const exportDeclarations = sourceFile.getExportDeclarations();
      for (const exportDecl of exportDeclarations) {
        if (!exportDecl.hasModuleSpecifier()) {
          continue;
        }

        const moduleSpecifier = exportDecl.getModuleSpecifierValue();
        if (!moduleSpecifier) {
          continue;
        }

        const exportSpecifiers: string[] = [];
        for (const named of exportDecl.getNamedExports()) {
          exportSpecifiers.push(named.getName());
        }

        const resolved = resolveModuleSpecifier(
          moduleSpecifier,
          file.path,
          aliasMap,
          existingFilePaths,
        );

        let targetId: string;
        let isExternal = false;

        if (resolved.resolvedPath && !resolved.isExternal) {
          targetId = createFileId(resolved.resolvedPath);
        } else {
          const pkgName = resolved.packageName || moduleSpecifier;
          targetId = createExternalModuleId(pkgName);
          isExternal = true;

          if (!externalModules[targetId]) {
            externalModules[targetId] = {
              id: targetId,
              name: pkgName,
              isExternal: true,
            };
          }
        }

        const candidateEdge = createGraphEdge({
          sourceId: fileId,
          targetId,
          kind: "re_export",
          isExternal,
          metadata:
            exportSpecifiers.length > 0
              ? { importSpecifiers: exportSpecifiers }
              : undefined,
        });

        if (edges[candidateEdge.id]) {
          edges[candidateEdge.id] = aggregateEdge(edges[candidateEdge.id]!, {
            importSpecifiers: exportSpecifiers,
            weightIncrement: 1,
          });
        } else {
          edges[candidateEdge.id] = candidateEdge;
        }
      }
    } catch {
      // Graceful tolerance for export parsing issues
    }
  }

  // Repository entity
  const repository: Repository = {
    id: createRepositoryId(repoInfo.owner, repoInfo.name),
    owner: repoInfo.owner,
    name: repoInfo.name,
    fullName: repoInfo.fullName,
    defaultBranch: repoInfo.defaultBranch,
    commitSha: repoInfo.commitSha,
    analyzedAt: new Date().toISOString(),
    totalFiles: files.length,
    totalSymbols: 0,
    languages: Object.freeze(languageCounts),
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };

  const graph: CodebaseGraph = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    repository,
    directories: Object.freeze(directoryNodes),
    files: Object.freeze(fileNodes),
    symbols: Object.freeze({}),
    externalModules: Object.freeze(externalModules),
    edges: Object.freeze(edges),
  };

  // Validate against canonical zod schema
  const validatedGraph = codebaseGraphSchema.parse(graph) as CodebaseGraph;

  return {
    graph: validatedGraph,
    fileSources: Object.freeze(fileSources),
  };
}
