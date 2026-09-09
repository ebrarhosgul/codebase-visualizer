# Codebase Parser

## Overview

This area manages repository extraction and abstract syntax tree parsing for JavaScript and TypeScript codebases. It extracts source files from GitHub archives in memory, parses syntax structures, and builds canonical file and symbol entities with dependency edges.

## Key files

| File                                 | Owns                                                                                    |
| ------------------------------------ | --------------------------------------------------------------------------------------- |
| [ast-parser.ts](ast-parser.ts)       | Abstract syntax tree traversal, symbol declaration extraction, and import edge creation |
| [tar-extractor.ts](tar-extractor.ts) | In memory tarball streaming and file extraction with safety caps                        |
| [path-alias.ts](path-alias.ts)       | TypeScript path alias extraction from tsconfig and module specifier resolution          |

## Conventions

- All parsing operations run inside an in memory virtual file system without writing temporary files to disk.
- Source locations use 1 indexed numbers for lines and columns, and 0 indexed numbers for character offsets.
- Always generate entity identifiers through the canonical ID factory functions from the entities layer.
- Keep parsing error recovery defensive so partial syntax errors in individual files do not fail the whole repository.

## Gotchas

- Ingestion enforces a defensive cap of 500 source files to prevent memory exhaustion in serverless environments.
- GitHub tarballs include a root directory prefix that must be stripped during extraction.
- Re exports and barrel index files must be resolved through tsconfig path aliases to find original symbol declarations.

## Related specs

- [0001-stack-and-architecture](../../docs/specs/0001-stack-and-architecture/index.md)
- [0005-walking-skeleton-loop](../../docs/specs/0005-walking-skeleton-loop/index.md)
- [0006-bidirectional-graph-and-code-deep-linking](../../docs/specs/0006-bidirectional-graph-and-code-deep-linking/index.md)

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
