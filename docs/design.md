# Design direction

Codebase Visualizer is a working instrument for understanding unfamiliar code. The graph and source are the subject. The product should feel inviting and confident, with a distinctive violet identity, generous space, and a clear path from a repository to its architecture.

This document defines the target system. The visual migration is ongoing; not every surface has been reviewed against this direction yet. CSS custom properties remain the source of truth for implemented token values. Update this guide and the tokens together when the design changes.

## Principles

1. **Make structure legible.** Use alignment, spacing, type weight, and a small set of surface colors to express hierarchy. Give the graph room to breathe and keep source code readable.
2. **Show what matters now.** Keep primary actions visible. Reveal secondary controls when they are relevant. Avoid repeated labels, decorative badges, nested cards, and permanent helper text that adds no information.
3. **Use color with purpose.** Neutral surfaces carry the workspace. Violet marks action, focus, and selection. Status colors communicate status, not decoration. Do not assign a different bright color to every node type.
4. **Keep the interface calm.** Use typography, alignment, and space to establish hierarchy. Keep repeated graph items simple, minimize nested cards, and use motion only when it explains a change.
5. **Respect the work.** Support keyboard navigation, readable contrast, reduced motion, and dense information without making targets difficult to use.

## Color

The palette pairs violet action colors with dark ink and soft neutral surfaces. The welcome screen uses a clear introduction and a short list of examples; the working canvas stays legible and efficient. Center the welcome introduction, static architecture illustration, helper copy, and example section horizontally. Keep example card contents left aligned, and stack the cards when the canvas is narrow. Both themes have equal status; dark remains the default until theme behavior is deliberately changed.

### Surfaces and text

| Semantic token | Dark | Light | Use |
|---|---|---|---|
| `--background`, `--surface-canvas` | `#101019` | `#f4f3fa` | App background and graph field |
| `--surface-panel` | `#181823` | `#ffffff` | Main panels and editor surround |
| `--surface-panel-secondary` | `#222230` | `#f5f3fa` | Toolbar, inset section, menu |
| `--surface-card` | `#242332` | `#ffffff` | Graph node and dialog |
| `--surface-hover` | `#303041` | `#ebe8f5` | Hover on a panel |
| `--surface-active` | `#37344c` | `#e5def7` | Selected row or pressed control |
| `--text-primary`, `--foreground` | `#f5f3ff` | `#272236` | Main text |
| `--text-secondary` | `#c0bacf` | `#554e65` | Supporting text |
| `--text-muted` | `#aaa4b9` | `#665e74` | Metadata and hints |
| `--border-subtle` | `#30303e` | `#e8e4f0` | Decorative separators |
| `--border-default` | `#484658` | `#cec8dc` | Visible boundaries |
| `--border-strong` | `#918ba8` | `#777086` | Boundaries needed to identify controls |
| `--border-focus` | `#c1aaff` | `#5b35b7` | Keyboard focus |

### Action and status

| Semantic token | Dark | Light | Use |
|---|---|---|---|
| `--accent-primary` | `#754ce2` | `#6740cf` | Primary action fill |
| `--accent-primary-hover` | `#6540c8` | `#5530b4` | Primary action hover |
| `--accent-primary-foreground` | `#ffffff` | `#ffffff` | Text on action fill |
| `--accent-text` | `#d1beff` | `#5830b6` | Links and selected labels |
| `--accent-subtle` | `#37304f` | `#eee8ff` | Restrained selected surface |
| `--accent-border` | `#b59aff` | `#7046d6` | Selected boundary where needed |
| `--status-success` | `#83cba5` | `#246b48` | Success text and icon |
| `--status-warning` | `#e2b96f` | `#805509` | Warning text and icon |
| `--status-error` | `#f09b96` | `#a92f2b` | Error text and icon |
| `--status-error-solid` | `#a92f2b` | `#a92f2b` | Destructive action fill with white text |
| `--status-info` | `#d1beff` | `#5830b6` | Information text and icon |

Use status color with a label or icon, never as the only signal. Syntax tokens `--syntax-ts`, `--syntax-js`, `--syntax-fn`, `--syntax-class`, and `--syntax-type` should use the primary or secondary text tokens. Distinguish kinds through names and compact icons. Keep syntax highlighting inside the code editor independently legible in each theme.

Test actual foreground and background pairs, including hover, selection, graph nodes, and tinted notices. Normal text must reach 4.5 to 1 and large text 3 to 1. Essential control boundaries and state indicators must reach 3 to 1 against adjacent colors. Decorative dividers need not meet the control boundary threshold. Do not assume a token passes on every surface merely because it passes on one.

## Typography

Use Geist Sans for interface copy and Geist Mono for code, paths, identifiers, and numerical graph metadata. Keep system font fallbacks. Avoid new font downloads for decoration. Use sentence case for labels and headings; use weight and spacing before uppercase or letter spacing to create hierarchy.

| Role | Size | Line height | Weight | Use |
|---|---|---|---|---|
| Detail | 12px | 16px | 400 or 500 | Metadata and compact labels |
| Body | 14px | 20px | 400 | Controls, descriptions, lists |
| Section | 14px | 20px | 600 | Panel headings |
| Title | 18px | 24px | 600 | Dialog and page titles |
| Code | 12px or user setting | at least 16px | 400 | Paths, identifiers, source |

Do not shrink essential text below 12px. Let long paths truncate with a way to inspect the full value. Respect browser zoom and the editor font size preference.

## Space, shape, and layers

Use a 4px base grid. The spacing scale is 4, 8, 12, 16, 24, and 32px. Use 8px within compact controls, 12px inside graph nodes and panel headers, 16px between panel sections, and 24px for larger separations. Use whitespace instead of another border when the relationship remains clear.

Use compact radii for small indicators and softer 8 to 16px corners for controls, nodes, menus, and dialogs. Pills are reserved for compact status or count indicators where their shape helps recognition. Use a single 1px border for most boundaries. Elevation is rare: a modest static shadow may distinguish a menu or dialog from its surroundings. Canvas nodes and persistent panels use no shadow by default.

Controls should normally have a 40px height where space allows. Dense controls may be smaller when needed, with at least a 24 by 24 CSS pixel target or sufficient spacing under WCAG 2.2. Keep primary actions easy to hit on touch screens. Resizable handles may have a thin visible rule but need a larger interactive area.

## Workspace and components

- The graph, code view, and inspector are peers in a resizable workspace. Panel headings identify the current context and expose only relevant actions. Preserve the graph as the largest available area when practical.
- Use one clear primary action per local task. Secondary actions are quiet buttons or menu items. Icon only controls need accessible names and tooltips when their meaning is not obvious.
- Nodes use a consistent surface, a concise name, and only metadata useful to the current task. Use a visible border or outline for selection. Paths, errors, and hidden items need clear text as well as visual cues.
- Edges stay thin and quiet at rest. Highlight the active relationship with a solid color and adequate contrast. Avoid animated dashes and glows across the graph.
- Empty, loading, and error states say what happened and offer a relevant next action. Avoid ornamental cards or extra prose. Loading feedback should remain stable as content arrives.
- On narrow screens, keep the graph usable and move supporting panels into accessible drawers or tabs. Preserve the current selection when changing layout.

## Interaction and accessibility

Provide visible keyboard focus with a 2px outline and 2px offset where space permits. Ensure focus is not clipped or obscured. Buttons, fields, menus, tabs, dialogs, and resize handles need appropriate names, semantics, and keyboard behavior. Dialogs return focus to their trigger. Never communicate selection, error, or relationship solely by color.

Keep transitions short and purposeful, generally 120 to 160ms for opacity or color on isolated controls. Respect `prefers-reduced-motion` by removing nonessential movement. Do not animate layout dimensions during graph interaction. Disabled controls need a recognizable disabled state and an explanation when the reason is not apparent.

## Performance rules

Treat graph nodes and edges as repeated content: even a small per item effect can become expensive at scale. Prefer opaque fills, simple borders, and static styling. Do not use backdrop filters, large blurred shadows, filters, blend modes, animated gradients, or continuous animations on the canvas or repeated nodes. Do not add `will-change` broadly. Avoid transitions on geometry and avoid expensive effects during pan, zoom, drag, or streaming.

Keep existing viewport pruning and progressive disclosure. Validate visual changes on a graph with hundreds of nodes using the performance targets in spec 0011 and the relevant current spec. Inspect frame behavior during pan, zoom, selection, and streaming. If a visual treatment harms interaction, simplify it before shipping.

## Token and implementation discipline

Define semantic color tokens and the type, spacing, radius, elevation, and motion scales centrally. Components consume those tokens rather than introducing local palette values. Map existing token names to the new values during implementation so migration is deliberate; audit graph, editor, dialogs, tooltips, and both themes for exceptions. Avoid adding tokens for a single decoration. Changes to token values require contrast checks on real component pairs and visual review at typical and dense graph sizes.

## Conversation and controls

Treat the conversation as readable content. Assistant responses sit directly on the panel, with clear spacing between messages. User messages have a quiet distinct surface. Keep citations and trace actions close to the answer they support. Place the input and send action inside one composer, and present suggested questions as simple rows. Use restrained borders, consistent control heights, and selected tabs with a clear underline.

## Workspace

Keep the entry screen focused on starting a repository. In the workspace, give search and view controls enough room to remain usable. Use simple rows for files and relationships, readable metrics, and consistent actions across the inspector, editor, and conversation. Keep graph selection visible without obscuring the map.
