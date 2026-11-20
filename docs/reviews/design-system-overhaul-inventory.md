# Design system overhaul inventory

Date: 2026-11-20

This is a starting inventory for spec 0004. The production build passed before visual changes. No performance baseline has been recorded yet, so the first build plan item remains open.

## Consumers to migrate

- `src/app/globals.css` defines the current dark and light semantic colors, radii, shadows, focus treatment, and Monaco line animation. Its values differ from `docs/design.md`.
- `src/components/ui/` contains shared controls and their token tests. Review control states, contrast, focus, and target sizes in both themes.
- `src/components/layout/`, `src/components/workspace/`, and `src/components/trace/` contain panels, drawers, menus, notices, and interaction states. `folder-tree.tsx`, `node-inspector.tsx`, and `repo-submission-bar.tsx` also contain inline styles.
- `src/components/canvas/architecture-canvas.tsx` contains hardcoded edge colors, markers, animated edges, and drop shadows. Its tests assert the old palette and animation. Preserve the existing state update and viewport pruning behavior when migrating these.
- `src/components/canvas/custom-minimap.tsx` contains hardcoded node colors. Review the other canvas node, group, control, and filter components for token usage and state indicators.
- `src/components/editor/code-viewer.tsx` fixes Monaco to `vs-dark` and contains an inline color. The editor needs an effective theme adapter and system preference updates.

## Baseline still needed

Use the headed production build and a recorded fixture with at least 300 graph nodes. Record fixture identity, node and edge counts, machine, browser version, viewport, zoom, and throttling. Capture three runs each for pan, zoom through the disclosure threshold, selection and tracing, and demo streaming with wheel zoom through the highlight commit. Record p95 frame time and visible stalls for each run, as specified in the overhaul performance measurement section. No measurements have been made or inferred in this inventory.

## Migration started

The baseline was deferred at the engineer's request. The first implementation pass updates the semantic palette, shared button sizing, file and symbol node selection, edge and minimap treatments, and editor theme selection. The panel and state audit, complete graph migration, real workspace checks in both themes, contrast and accessibility review, and performance measurements remain open. The baseline must use the pre migration revision if a before and after comparison is needed.
