# Graph Engine

## Overview

This area houses the core graph algorithms, filtering logic, and visual layout adapters. It converts canonical codebase data into interactive graph layouts, performs topological searches, and manages architectural layer filtering.

## Key files

| File                                                             | Owns                                                                          |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [filtering.ts](filtering.ts)                                     | Outermost folder collapse resolution, edge bundling, and layer filtering      |
| [layers.ts](layers.ts)                                           | Architectural layer taxonomy and file path classification rules               |
| [traversal.ts](traversal.ts)                                     | Cycle safe breadth first traversal, ancestor queries, and topological sorting |
| [path-validation.ts](path-validation.ts)                         | Deterministic validation for query paths and common ancestor calculations     |
| [inspection.ts](inspection.ts)                                   | Dependency inspection, caller callee relationships, and node metrics          |
| [layout/dagre-layout.ts](layout/dagre-layout.ts)                 | Hierarchical graph layout positioning and node boundary calculations          |
| [adapters/react-flow-adapter.ts](adapters/react-flow-adapter.ts) | Conversion of codebase graph entities into React Flow nodes and edges         |

## Conventions

- Pure functions only with immutable data structures. Never mutate graph entities or node records in place.
- All traversal routines must guard against cycles by tracking visited nodes and enforcing depth limits.
- Architectural layers use a strict ranking system from priority rank 1 to 8 to classify file paths.
- All exported functions and interfaces must provide clear documentation comments.

## Gotchas

- When collapsing folders, always resolve outermost ancestors first so child directories are correctly subsumed.
- Edges that connect to collapsed or hidden nodes must be aggregated into bundled summary edges.
- Dagre layout positions must account for node dimensions to prevent visual overlaps on initial canvas load.

## Related specs

- [0003-graph-and-repository-data-model](../../docs/specs/0003-graph-and-repository-data-model/index.md)
- [0007-architectural-filtering-and-layer-inspection](../../docs/specs/0007-architectural-filtering-and-layer-inspection/index.md)

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
