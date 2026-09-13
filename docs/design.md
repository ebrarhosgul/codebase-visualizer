# Design System and UI Foundation

This document defines the visual language, design tokens, spacing system, typography pairings, component states, and accessibility rules for Codebase Visualizer. All future feature slices follow these foundations.

## Character

Codebase Visualizer is a dense developer workspace engineered for inspecting deep code architectures. The visual tone is technical, quiet, and precise. High contrast dark surfaces minimize eye strain during extended reading sessions. Sharp panel dividers and subtle hover states guide attention without decorative clutter.

## Build Mandate

1. Dark mode first: The default appearance is deep slate. Every surface and interactive element must maintain at least 4.5 to 1 text contrast and 3 to 1 non text UI border contrast.
2. High density layout: Compact padding and fixed line heights maximize screen estate for graph nodes and code inspection.
3. Accessible by default: Visible keyboard focus rings, full keyboard traversal, and screen reader announcements for panel transitions.
4. Token discipline: Use semantic tokens from `src/app/globals.css`. Never use arbitrary hex colors in component code.

## Color Tokens

Token values live in `src/app/globals.css` as native CSS custom properties and Tailwind CSS v4 inline theme variables.

### Surfaces

| Token | Dark Value | Light Value | Purpose |
|---|---|---|---|
| `--surface-canvas` | `#0b0c0e` | `#f4f4f5` | Graph canvas backdrop |
| `--surface-panel` | `#121417` | `#ffffff` | Primary sidebars and inspector panels |
| `--surface-panel-secondary` | `#181b1f` | `#f4f4f5` | Elevated panel headers and tab strips |
| `--surface-card` | `#15171b` | `#ffffff` | Graph node cards and floating dialogs |
| `--surface-hover` | `rgba(255, 255, 255, 0.04)` | `rgba(0, 0, 0, 0.04)` | Hover highlight state |
| `--surface-active` | `rgba(255, 255, 255, 0.08)` | `rgba(0, 0, 0, 0.08)` | Selected or active item highlight |

### Borders

| Token | Dark Value | Light Value | Purpose |
|---|---|---|---|
| `--border-subtle` | `rgba(255, 255, 255, 0.07)` | `#e4e4e7` | Dividers and internal panel rules |
| `--border-default` | `rgba(255, 255, 255, 0.12)` | `#d4d4d8` | Panel perimeters and input outlines |
| `--border-focus` | `#3b82f6` | `#2563eb` | Visible focus outline ring |

### Text Hierarchy

| Token | Dark Value | Light Value | Contrast Ratio |
|---|---|---|---|
| `--text-primary` | `#f4f4f5` | `#18181b` | Greater than 13 to 1 |
| `--text-secondary` | `#a1a1aa` | `#71717a` | Greater than 5 to 1 |
| `--text-muted` | `#71717a` | `#a1a1aa` | Greater than 4.5 to 1 |

### Interactive Accents

| Token | Dark Value | Light Value | Purpose |
|---|---|---|---|
| `--accent-primary` | `#3b82f6` | `#2563eb` | Primary action buttons and links |
| `--accent-primary-hover` | `#2563eb` | `#1d4ed8` | Hover state on primary actions |
| `--accent-primary-foreground` | `#ffffff` | `#ffffff` | Readable text on primary accent |

### Status Indicators

| Status | Dark Value | Light Value | Meaning |
|---|---|---|---|
| Success | `#10b981` | `#059669` | Verified checks, parsed states, clean builds |
| Warning | `#f59e0b` | `#d97706` | External packages, cycles, rate limits |
| Error | `#ef4444` | `#dc2626` | Parse errors, broken links, failed queries |
| Info | `#3b82f6` | `#2563eb` | Informational callouts and tooltips |

### Syntax Badges

| Node Kind | Token Name | Hex Color | Purpose |
|---|---|---|---|
| TypeScript | `--syntax-ts` | `#a1a1aa` | TypeScript file nodes |
| JavaScript | `--syntax-js` | `#a1a1aa` | JavaScript file nodes |
| Function | `--syntax-fn` | `#d4d4d8` | Callable functions and methods |
| Class | `--syntax-class` | `#e4e4e7` | Classes and constructors |
| Type | `--syntax-type` | `#a1a1aa` | Types and interfaces |

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
- `p-2` (8px): Standard button padding, input fields, dropdown items
- `p-3` (12px): Panel headers, node card inner body
- `p-4` (16px): Dialog bodies, inspector detail sections

## Component States

1. Default: Quiet surface with subtle border.
2. Hover: Elevated background via `--surface-hover` with smooth transition.
3. Focus visible: 2px solid outline in `--border-focus` with 2px offset.
4. Active or Selected: Background highlight via `--surface-active` and accent border.
5. Disabled: Opacity reduced to 50 percent, cursor not allowed, pointer events disabled.

## Accessibility Rules

- All interactive controls provide accessible names via text children or `aria-label`.
- Resizable drag handles provide `role="separator"`, `aria-orientation`, and keyboard arrow navigation.
- Focus traps in modals preserve tab loops and dismiss on Escape.
- Theme preference defaults to dark mode and preserves user choice without layout flash.
