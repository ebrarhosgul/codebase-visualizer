# 0007. Architectural Filtering and Layer Inspection: Rationale

**Date**: 2026-09-05

## Context

When engineers open medium or large software repositories in the visualizer, the canvas can quickly display hundreds of files, thousands of imports, and deeply nested folder clusters. While a comprehensive graph map provides an honest view of physical file organization, visual density can overwhelm developers attempting to answer focused architectural questions. An architect evaluating the boundary between domain entities and state management stores does not need to see thirty leaf utility files or twenty user interface button components scattered across the canvas.

Furthermore, analyzing module coupling requires inspecting incoming callers and outgoing callees in detail. Without dedicated inspection tooling, developers must manually trace edges through tangled canvas clusters or open individual source files to inspect raw import statements. To make the architecture canvas genuinely usable for refactoring, boundary reviews, and codebase onboarding, the system requires flexible filtering controls, hierarchical directory collapsing, and structural dependency inspection.

The system must satisfy these core forces:
1. High performance on client devices: filtering and collapsing must run smoothly in the browser without freezing the UI thread or requiring round trips to a server.
2. Readability without misleading connections: collapsing folders or hiding layers must simplify the visual representation without fabricating non existent direct dependencies.
3. Bidirectional navigation harmony: filtering and inspecting nodes must integrate seamlessly with existing Monaco editor deep linking and URL state synchronization.

## Options considered

### Option 1: Client side graph pruning with Dagre relayout, aggregate folder summary cards, and enhanced right side Inspector panel (Chosen)

Filter criteria are applied to the in memory graph model, removing excluded nodes and recomputing Dagre hierarchical layout positions dynamically. Collapsing a directory replaces child file cards with a compact summary folder node that aggregates cross folder edges with numeric count badges. The right side inspector panel computes caller, callee, and declaration metrics on demand, rendering interactive chips for dual action navigation.

**Pros**:
- Maximizes canvas clarity by packing visible nodes cleanly without dead space or ghost node clutter.
- Preserves high level system connectivity through aggregated cross folder summary edges.
- Unifies structural dependency inspection with code exploration in the existing workspace layout.

**Cons**:
- Relayout shifts spatial positions of surviving nodes, which can require a brief visual reorientation.
- In memory edge aggregation introduces layout recalculation overhead on very large graphs.

### Option 2: Static ghost dimming with preserved coordinates

Keep all nodes and edges in their original Dagre layout positions, reducing the opacity of excluded nodes to 15 percent and muting excluded edges. Collapsed directories fade internal contents while maintaining full container dimensions.

**Pros**:
- Completely preserves spatial memory and coordinate stability because nodes never move.
- Fast performance because no layout recalculation is required.

**Cons**:
- Does not solve visual density or canvas sprawl, as ghost nodes continue to occupy canvas real estate.
- Hard to distinguish intricate dependency paths through overlapping dimmed elements.

### Option 3: Multi window popover drawer and floating canvas modals

Implement filtering as canvas popovers and render node inspection in floating drill down modal windows anchored directly to selected nodes on the canvas.

**Pros**:
- Keeps inspection context in close physical proximity to the selected graph node.
- Avoids sharing horizontal screen width with the Monaco code viewer.

**Cons**:
- Floating modals cover adjacent graph nodes and edges, blocking visual context.
- Interferes with simultaneous code reading and cross symbol navigation.

## Rationale

We chose Option 1 because architectural visualizers become useful only when they tame complexity. In large applications, spatial memory is far less valuable than immediate visual clarity: an engineer filtering for store to entity dependencies wants to see a clean, compact diagram of those two layers interacting, not a sparse constellation of highlighted boxes separated by miles of dimmed blank space.

Recomputing the Dagre layout produces an uncluttered, publication grade diagram of the chosen architectural slice. To prevent disorienting camera jumps during layout changes, we accompany bulk filter and collapse actions with smooth animated camera transitions.

Aggregating external edges into weighted summary connections on collapsed folder cards strikes the ideal balance between simplicity and truth: it keeps the canvas clean while preserving the exact volume of coupling between architectural packages.

Finally, expanding the existing right side Inspector panel leverages our established workspace layout primitives, allowing engineers to jump directly between architectural callers, callees, and exact lines of code in Monaco without screen clutter.
