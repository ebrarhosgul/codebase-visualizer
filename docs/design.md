# Design System and UI Foundation

This document defines the visual language, design tokens, spacing system, typography pairings, component states, and accessibility rules for Codebase Visualizer. All future feature slices follow these foundations.

## Character

Codebase Visualizer is a dense developer workspace engineered for inspecting deep code architectures. The visual tone is technical, quiet, and precise, closer to an editor than a marketing page. Near neutral dark surfaces minimize eye strain during extended reading sessions. Opaque one pixel panel rules, tight corners, and short hard shadows keep edges crisp. Accent and status hues are kept muted so color carries meaning instead of decoration.

## Build Mandate

1. Dark mode first: The default appearance is deep slate. Every surface and interactive element must maintain at least 4.5 to 1 text contrast and 3 to 1 non text UI border contrast.
2. High density layout: Compact padding and fixed line heights maximize screen estate for graph nodes and code inspection.
3. Accessible by default: Visible keyboard focus rings, full keyboard traversal, and screen reader announcements for panel transitions.
4. Token discipline: Use semantic tokens from `src/app/globals.css`. Never use arbitrary hex colors or raw palette classes such as `zinc-800` or `blue-500` in component code. Use the semantic utilities (`bg-surface-panel`, `text-text-secondary`, `border-border-subtle`, `text-status-warning`) so both themes follow.
5. Pointer for actions: Every enabled button and button like control shows the pointer cursor. Disabled controls show the not allowed cursor. A global base rule covers raw elements, and `Button` and `IconButton` also carry `cursor-pointer`.

## Color Tokens

Token values live in `src/app/globals.css` as native CSS custom properties and Tailwind CSS v4 inline theme variables.

### Surfaces

| Token | Dark Value | Light Value | Purpose |
|---|---|---|---|
| `--surface-canvas` | `#0e0f11` | `#eceef1` | Graph canvas backdrop and inset fields |
| `--surface-panel` | `#141518` | `#ffffff` | Primary sidebars and inspector panels |
| `--surface-panel-secondary` | `#1a1c20` | `#f4f5f7` | Elevated panel headers, menus, and tooltips |
| `--surface-card` | `#17181c` | `#ffffff` | Graph node cards and floating dialogs |
| `--surface-hover` | `rgba(255, 255, 255, 0.045)` | `rgba(0, 0, 0, 0.045)` | Hover highlight state |
| `--surface-active` | `rgba(255, 255, 255, 0.08)` | `rgba(0, 0, 0, 0.08)` | Selected or active item highlight |

### Borders

| Token | Dark Value | Light Value | Purpose |
|---|---|---|---|
| `--border-subtle` | `#23262b` | `#e3e6ea` | Dividers and internal panel rules |
| `--border-default` | `#2f333a` | `#d0d5db` | Panel perimeters, card and input outlines |
| `--border-strong` | `#444a54` | `#aab1ba` | Hover outlines, selected rows, and scrollbar thumbs |
| `--border-focus` | `#5b93e8` | `#2b62b8` | Visible focus outline ring |

Borders are opaque hex values, not translucent overlays, so rules stay one crisp pixel on every surface.

### Text Hierarchy

| Token | Dark Value | Light Value | Contrast Ratio |
|---|---|---|---|
| `--text-primary` | `#e6e8eb` | `#1b1e23` | Greater than 13 to 1 |
| `--text-secondary` | `#a0a6b0` | `#4f5763` | Greater than 6.5 to 1 |
| `--text-muted` | `#838a96` | `#626a77` | Greater than 4.5 to 1 |

Contrast is checked on every surface, in both themes, by `src/components/ui/__tests__/design-tokens.test.ts`.

### Interactive Accents

| Token | Dark Value | Light Value | Purpose |
|---|---|---|---|
| `--accent-primary` | `#3a6fc4` | `#2b62b8` | Primary action fills and selected borders |
| `--accent-primary-hover` | `#335fa8` | `#234f96` | Hover state on primary actions |
| `--accent-primary-foreground` | `#ffffff` | `#ffffff` | Readable text on primary accent |
| `--accent-text` | `#7fa8e8` | `#2b62b8` | Accent colored text and icons on surfaces |
| `--accent-subtle` | `rgba(91, 147, 232, 0.12)` | `rgba(43, 98, 184, 0.1)` | Tinted accent backgrounds |
| `--accent-border` | `rgba(91, 147, 232, 0.4)` | `rgba(43, 98, 184, 0.4)` | Accent outlines and text selection |

### Status Indicators

| Status | Dark Value | Light Value | Meaning |
|---|---|---|---|
| Success (`--status-success`) | `#5bb98b` | `#26704e` | Verified checks, parsed states, clean builds |
| Warning (`--status-warning`) | `#d6a24e` | `#91620f` | External packages, cycles, rate limits |
| Error (`--status-error`) | `#e0706c` | `#b83a36` | Parse errors, broken links, failed queries |
| Error solid (`--status-error-solid`) | `#b23c3a` | `#b23c3a` | Fill behind white text on danger buttons |
| Info (`--status-info`) | `#7fa8e8` | `#2b62b8` | Informational callouts and tooltips |

Status hues are for text, icons, and tints at 10 to 30 percent (`bg-status-warning/10`). Only `--status-error-solid` is used as a fill under white text.

### Syntax Badges

| Node Kind | Token Name | Hex Color | Purpose |
|---|---|---|---|
| TypeScript | `--syntax-ts` | `#a0a6b0` | TypeScript file nodes |
| JavaScript | `--syntax-js` | `#a0a6b0` | JavaScript file nodes |
| Function | `--syntax-fn` | `#cdd1d8` | Callable functions and methods |
| Class | `--syntax-class` | `#dde0e5` | Classes and constructors |
| Type | `--syntax-type` | `#a0a6b0` | Types and interfaces |

## Typography

The typography scale pairs Geist Sans for user interface elements and Geist Mono for code, coordinates, file paths, and metrics.

| Token | Size | Line Height | Tracking | Usage |
|---|---|---|---|---|
| `text-xs` | 12px | 16px | normal | Badges, tags, node metadata |
| `text-sm` | 14px | 20px | normal | Body text, sidebar items, tree rows |
| `text-base` | 16px | 24px | normal | Primary headings in panels, dialog titles |
| `text-lg` | 18px | 28px | tight | Section headers |
| `text-xl` | 20px | 28px | tight | Main navigation headings |
| `font-mono text-xs` | 12px | 16px | normal | Code identifiers, coordinates, zoom levels |

## Spacing and Density

Compact 4px grid spacing ensures high density layouts without waste:

- `p-1` (4px): Icon buttons, compact badges
- `p-1.5` (6px): Split handle hit targets, dense tree rows
- `p-2` (8px): Input fields, dropdown items
- `p-3` (12px): Panel headers, node card inner body
- `p-4` (16px): Dialog bodies, inspector detail sections

Control heights follow the same density. All stay at or above the 24px minimum target size:

| Control | `sm` | `md` | `lg` |
|---|---|---|---|
| `Button` | 24px | 28px | 32px |
| `IconButton` | 24px | 28px | not offered |
| `Input` | not offered | 28px | not offered |
| `Tabs` trigger | not offered | 24px in a 32px strip | not offered |

## Radius and Elevation

Corners are tight, like an editor. The scale lives in `@theme` in `src/app/globals.css`, so the standard `rounded-*` and `shadow-*` utilities pick it up. Bare `rounded` is not used because it ignores the scale. Write `rounded-sm` instead.

| Utility | Value | Usage |
|---|---|---|
| `rounded-xs` | 2px | Inline code chips |
| `rounded-sm` | 3px | Badges, menu items, small icon toggles |
| `rounded-md` | 4px | Buttons, inputs, tabs, tooltips |
| `rounded-lg` | 6px | Toasts, menus, node cards, list cards |
| `rounded-xl` | 8px | Dialogs and grouped panels |
| `rounded-full` | pill | Dots, handles, progress tracks only |

Shadows are short and hard (`shadow-xs` is 1px, `shadow-2xl` reaches 12px down). Do not use `backdrop-blur`. Overlays use a solid dim layer, which also keeps canvas repaint cheap.

## Component States

1. Default: Quiet surface with subtle border.
2. Hover: Elevated background via `--surface-hover` with smooth transition.
3. Focus visible: 2px solid outline in `--border-focus` with 2px offset.
4. Active or Selected: Background highlight via `--surface-active` and accent border.
5. Disabled: Opacity reduced to 50 percent, cursor not allowed, pointer events disabled.
6. Cursor: Enabled buttons, tabs, menu items, and other controls use the pointer. Drag handles keep their resize cursors.

Button variants (`primary`, `secondary`, `ghost`, `danger`) all carry a one pixel border, transparent for `ghost`, so hover and focus never shift the layout.

## Accessibility Rules

- All interactive controls provide accessible names via text children or `aria-label`.
- Resizable drag handles provide `role="separator"`, `aria-orientation`, and keyboard arrow navigation.
- Focus traps in modals preserve tab loops and dismiss on Escape.
- Theme preference defaults to dark mode and preserves user choice without layout flash.
