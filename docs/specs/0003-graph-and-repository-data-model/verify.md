# Verify: Graph and repository data model · spec 0003 · updated 2026-09-02

_Steps derived from spec 0003 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## Commands

- [ ] `npm run typecheck` → passes with strict TypeScript validation across all entity types → AC-1, AC-5
- [ ] `npm run lint` → passes without lint errors across all domain entity files → AC-1
- [ ] `npm test` → Vitest suite passes all 37 unit tests for entity validation, deterministic IDs, cycle safe traversal, and React Flow adapter → AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8
- [ ] `npm run build` → Next.js production build succeeds with clean type checking → AC-1, AC-8

## Verification checklist

- [ ] `Repository` entity validates correctly with required metadata fields and schema version → AC-1
- [ ] `DirectoryNode`, `FileNode`, and `SymbolNode` generate deterministic identifiers from paths and symbol names → AC-2
- [ ] Code containment hierarchy links directory nodes to child files and files to declared symbols → AC-3
- [ ] Edge taxonomy validates all relationship kinds (`file_import`, `re_export`, `call`, `type_reference`, `heritage`, `contains`) and external package flags → AC-4
- [ ] Source locations record both character offsets and 1 indexed line and column coordinates → AC-5
- [ ] Graph traversal and path tracing utilities navigate circular dependencies safely without infinite loops → AC-6
- [ ] Serialized graph round trips cleanly through JSON with schema version checking and invalidates on version mismatch → AC-7
- [ ] Pure projection adapter transforms canonical `CodebaseGraph` into valid React Flow nodes and edges → AC-8

## Acceptance criteria coverage

- AC-1 canonical entity schemas covered by `src/entities/__tests__/core-schemas.test.ts` and `src/entities/__tests__/codebase-graph.test.ts`
- AC-2 deterministic identity scheme covered by `src/entities/__tests__/core-schemas.test.ts` and `src/entities/__tests__/edge.test.ts`
- AC-3 multi level code hierarchy covered by `src/entities/__tests__/core-schemas.test.ts`
- AC-4 typed edge taxonomy and aggregation covered by `src/entities/__tests__/edge.test.ts`
- AC-5 source position and range precision covered by `src/entities/__tests__/core-schemas.test.ts`
- AC-6 cycle safe traversal covered by `src/graph/__tests__/traversal-and-adapter.test.ts`
- AC-7 serialization and schema versioning covered by `src/entities/__tests__/codebase-graph.test.ts`
- AC-8 decoupled React Flow projection covered by `src/graph/__tests__/traversal-and-adapter.test.ts`
