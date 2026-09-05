import { Project, SyntaxKind, type SourceFile, type Node } from "ts-morph";
import {
  type CodebaseGraph,
  type DirectoryNode,
  type FileNode,
  type ExternalModuleNode,
  type GraphEdge,
  type Repository,
  type SymbolNode,
  type SourceLocation,
  createRepositoryId,
  createDirectoryId,
  createFileId,
  createExternalModuleId,
  createSymbolId,
  createDefaultExportSymbolId,
  createGraphEdge,
  aggregateEdge,
  codebaseGraphSchema,
  CURRENT_SCHEMA_VERSION,
} from "@/entities";
import type { ExtractedFile, GitHubRepoInfo } from "@/types/ingestion";
import { extractPathAliases, resolveModuleSpecifier } from "./path-alias";

/**
 * Computes 1-indexed line/column and 0-indexed offset SourceLocation from ts-morph Node.
 */
function getNodeSourceLocation(
  sourceFile: SourceFile,
  node: Node,
): SourceLocation {
  const startOffset = Math.max(0, node.getStart());
  const endOffset = Math.max(startOffset, node.getEnd());
  const startPos = sourceFile.getLineAndColumnAtPos(startOffset);
  const endPos = sourceFile.getLineAndColumnAtPos(endOffset);

  return {
    startLine: Math.max(1, startPos.line),
    startColumn: Math.max(1, startPos.column),
    endLine: Math.max(1, endPos.line),
    endColumn: Math.max(1, endPos.column),
    startOffset,
    endOffset,
  };
}

/**
 * Extracts modifier visibility from a node.
 */
function getSymbolVisibility(node: Node): "public" | "protected" | "private" {
  const anyNode = node as unknown as {
    hasModifier?: (kind: number) => boolean;
  };
  if (typeof anyNode.hasModifier === "function") {
    if (anyNode.hasModifier(SyntaxKind.PrivateKeyword)) {
      return "private";
    }
    if (anyNode.hasModifier(SyntaxKind.ProtectedKeyword)) {
      return "protected";
    }
  }
  return "public";
}

/**
 * Formats a concise signature string from a declaration node.
 */
function getSymbolSignature(node: Node, fallbackName: string): string {
  try {
    const firstLine = node.getText().split("\n")[0]?.trim();
    if (firstLine && firstLine.length > 0) {
      return firstLine.slice(0, 160);
    }
  } catch {
    // Ignore text formatting issues
  }
  return fallbackName;
}

/**
 * Extracts jsdoc comment documentation from a declaration node.
 */
function getSymbolDoc(node: Node): string | null {
  const anyNode = node as unknown as {
    getJsDocs?: () => readonly { getDescription?: () => string }[];
  };
  if (typeof anyNode.getJsDocs === "function") {
    try {
      const docs = anyNode.getJsDocs();
      if (Array.isArray(docs) && docs.length > 0) {
        const description = docs[0]?.getDescription?.()?.trim();
        if (description) {
          return description;
        }
      }
    } catch {
      // Ignore documentation read issues
    }
  }
  return null;
}

/**
 * Extracts top-level declarations and class methods into canonical SymbolNode entities.
 */
function extractSourceSymbols(
  sourceFile: SourceFile,
  filePath: string,
  fileId: string,
  existingSymbols: Record<string, SymbolNode>,
): readonly string[] {
  const fileSymbolIds: string[] = [];

  function registerSymbol(
    rawSymbol: Omit<SymbolNode, "id">,
    preferredName: string,
  ): string {
    const baseId =
      rawSymbol.isDefaultExport && preferredName === "default"
        ? createDefaultExportSymbolId(filePath)
        : createSymbolId(filePath, preferredName);

    let symbolId = baseId;
    let counter = 2;
    while (existingSymbols[symbolId]) {
      symbolId = `${baseId}_${counter}`;
      counter++;
    }

    const symbol: SymbolNode = {
      ...rawSymbol,
      id: symbolId,
    };
    existingSymbols[symbolId] = symbol;
    fileSymbolIds.push(symbolId);
    return symbolId;
  }

  try {
    // 1. Functions
    for (const fn of sourceFile.getFunctions()) {
      const name =
        fn.getName() ||
        (fn.isDefaultExport() ? "default" : "anonymousFunction");
      const range = getNodeSourceLocation(sourceFile, fn);
      const nameNode = fn.getNameNode();
      const selectionRange = nameNode
        ? getNodeSourceLocation(sourceFile, nameNode)
        : range;

      registerSymbol(
        {
          fileId,
          parentSymbolId: null,
          name,
          kind: "function",
          range,
          selectionRange,
          isExported: fn.isExported(),
          isDefaultExport: fn.isDefaultExport(),
          signature: getSymbolSignature(fn, `function ${name}`),
          documentation: getSymbolDoc(fn),
          visibility: getSymbolVisibility(fn),
          childSymbolIds: Object.freeze([]),
        },
        name,
      );
    }

    // 2. Classes and methods
    for (const cls of sourceFile.getClasses()) {
      const name =
        cls.getName() || (cls.isDefaultExport() ? "default" : "anonymousClass");
      const range = getNodeSourceLocation(sourceFile, cls);
      const nameNode = cls.getNameNode();
      const selectionRange = nameNode
        ? getNodeSourceLocation(sourceFile, nameNode)
        : range;

      const methodIds: string[] = [];

      for (const method of cls.getMethods()) {
        const methodName = method.getName();
        const methodRange = getNodeSourceLocation(sourceFile, method);
        const methodNameNode = method.getNameNode();
        const methodSelectionRange = methodNameNode
          ? getNodeSourceLocation(sourceFile, methodNameNode)
          : methodRange;

        const methodSymbolId = registerSymbol(
          {
            fileId,
            parentSymbolId: null,
            name: `${name}.${methodName}`,
            kind: "method",
            range: methodRange,
            selectionRange: methodSelectionRange,
            isExported: cls.isExported(),
            isDefaultExport: false,
            signature: getSymbolSignature(method, `${methodName}()`),
            documentation: getSymbolDoc(method),
            visibility: getSymbolVisibility(method),
            childSymbolIds: Object.freeze([]),
          },
          `${name}.${methodName}`,
        );

        methodIds.push(methodSymbolId);
      }

      const classSymbolId = registerSymbol(
        {
          fileId,
          parentSymbolId: null,
          name,
          kind: "class",
          range,
          selectionRange,
          isExported: cls.isExported(),
          isDefaultExport: cls.isDefaultExport(),
          signature: getSymbolSignature(cls, `class ${name}`),
          documentation: getSymbolDoc(cls),
          visibility: getSymbolVisibility(cls),
          childSymbolIds: Object.freeze(methodIds),
        },
        name,
      );

      for (const mId of methodIds) {
        const existingMethod = existingSymbols[mId];
        if (existingMethod) {
          existingSymbols[mId] = {
            ...existingMethod,
            parentSymbolId: classSymbolId,
          };
        }
      }
    }

    // 3. Interfaces
    for (const iface of sourceFile.getInterfaces()) {
      const name = iface.getName();
      const range = getNodeSourceLocation(sourceFile, iface);
      const nameNode = iface.getNameNode();
      const selectionRange = nameNode
        ? getNodeSourceLocation(sourceFile, nameNode)
        : range;

      registerSymbol(
        {
          fileId,
          parentSymbolId: null,
          name,
          kind: "interface",
          range,
          selectionRange,
          isExported: iface.isExported(),
          isDefaultExport: iface.isDefaultExport(),
          signature: getSymbolSignature(iface, `interface ${name}`),
          documentation: getSymbolDoc(iface),
          visibility: "public",
          childSymbolIds: Object.freeze([]),
        },
        name,
      );
    }

    // 4. Type Aliases
    for (const typeAlias of sourceFile.getTypeAliases()) {
      const name = typeAlias.getName();
      const range = getNodeSourceLocation(sourceFile, typeAlias);
      const nameNode = typeAlias.getNameNode();
      const selectionRange = nameNode
        ? getNodeSourceLocation(sourceFile, nameNode)
        : range;

      registerSymbol(
        {
          fileId,
          parentSymbolId: null,
          name,
          kind: "type_alias",
          range,
          selectionRange,
          isExported: typeAlias.isExported(),
          isDefaultExport: typeAlias.isDefaultExport(),
          signature: getSymbolSignature(typeAlias, `type ${name}`),
          documentation: getSymbolDoc(typeAlias),
          visibility: "public",
          childSymbolIds: Object.freeze([]),
        },
        name,
      );
    }

    // 5. Enums
    for (const enumDecl of sourceFile.getEnums()) {
      const name = enumDecl.getName();
      const range = getNodeSourceLocation(sourceFile, enumDecl);
      const nameNode = enumDecl.getNameNode();
      const selectionRange = nameNode
        ? getNodeSourceLocation(sourceFile, nameNode)
        : range;

      registerSymbol(
        {
          fileId,
          parentSymbolId: null,
          name,
          kind: "enum",
          range,
          selectionRange,
          isExported: enumDecl.isExported(),
          isDefaultExport: enumDecl.isDefaultExport(),
          signature: getSymbolSignature(enumDecl, `enum ${name}`),
          documentation: getSymbolDoc(enumDecl),
          visibility: "public",
          childSymbolIds: Object.freeze([]),
        },
        name,
      );
    }

    // 6. Variable statements (functions, arrow functions, constants)
    for (const varStmt of sourceFile.getVariableStatements()) {
      const isExported = varStmt.isExported();
      const isDefaultExport = varStmt.isDefaultExport();
      const doc = getSymbolDoc(varStmt);

      for (const varDecl of varStmt.getDeclarations()) {
        const name = varDecl.getName();
        const initializer = varDecl.getInitializer();
        const isArrowOrFunc =
          initializer &&
          (initializer.getKind() === SyntaxKind.ArrowFunction ||
            initializer.getKind() === SyntaxKind.FunctionExpression);

        const range = getNodeSourceLocation(sourceFile, varDecl);
        const nameNode = varDecl.getNameNode();
        const selectionRange = nameNode
          ? getNodeSourceLocation(sourceFile, nameNode)
          : range;

        registerSymbol(
          {
            fileId,
            parentSymbolId: null,
            name,
            kind: isArrowOrFunc ? "function" : "variable",
            range,
            selectionRange,
            isExported,
            isDefaultExport,
            signature: getSymbolSignature(varDecl, name),
            documentation: doc,
            visibility: "public",
            childSymbolIds: Object.freeze([]),
          },
          name,
        );
      }
    }
  } catch {
    // Gracefully tolerate symbol extraction issues on malformed files
  }

  return Object.freeze(fileSymbolIds);
}

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
  const program = project.getProgram();

  const fileNodes: Record<string, FileNode> = {};
  const symbols: Record<string, SymbolNode> = {};
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
    let fileSymbolIds: readonly string[] = Object.freeze([]);

    if (sourceFile) {
      try {
        const syntacticDiagnostics =
          program.getSyntacticDiagnostics(sourceFile);
        if (syntacticDiagnostics.length > 0) {
          const firstMsg = syntacticDiagnostics[0]?.getMessageText();
          parseError =
            typeof firstMsg === "string"
              ? firstMsg
              : (firstMsg?.getMessageText() ??
                "Syntax error detected in file.");
        }
      } catch {
        // Tolerant of diagnostic failures
      }

      fileSymbolIds = extractSourceSymbols(
        sourceFile,
        file.path,
        fileId,
        symbols,
      );
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
      symbolIds: fileSymbolIds,
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
    totalSymbols: Object.keys(symbols).length,
    languages: Object.freeze(languageCounts),
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };

  const graph: CodebaseGraph = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    repository,
    directories: Object.freeze(directoryNodes),
    files: Object.freeze(fileNodes),
    symbols: Object.freeze(symbols),
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
