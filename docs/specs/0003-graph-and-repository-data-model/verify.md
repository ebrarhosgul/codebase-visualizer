# Verify: Graph and repository data model (September 2, 2026)

Steps to confirm domain data models and schemas validate cleanly.

## Commands

- [ ] `npm run typecheck`: passes with strict TypeScript validation across all entity types
- [ ] `npm run lint`: passes without lint errors across all domain entity files
- [ ] `npm test`: Vitest suite passes all unit tests for entity validation and traversal

## Verification checklist

- [ ] `Repository` entity validates correctly with required metadata fields and schema version (verifies **AC-1**)
- [ ] `DirectoryNode`, `FileNode`, and `SymbolNode` generate deterministic identifiers from paths and symbol names (verifies **AC-2**)
- [ ] Code containment hierarchy correctly links directory nodes to child files and files to declared symbols (verifies **AC-3**)
- [ ] Edge taxonomy validates all relationship kinds (`file_import`, `re_export`, `call`, `type_reference`, `heritage`, `contains`) and external package flags (verifies **AC-4**)
- [ ] Source locations record both character offsets and 1 indexed line and column coordinates (verifies **AC-5**)
- [ ] Graph traversal and path tracing utilities navigate circular dependencies safely without infinite loops (verifies **AC-6**)
- [ ] Serialized graph round trips cleanly through JSON with schema version checking and invalidates on version mismatch (verifies **AC-7**)
- [ ] Pure projection adapter transforms canonical `CodebaseGraph` into valid React Flow nodes and edges (verifies **AC-8**)
