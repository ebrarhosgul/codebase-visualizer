# 0004. Design System and UI Foundation: Rationale

## Context

Codebase Visualizer is an interactive developer tool designed to display code architecture maps, hierarchical file trees, and source code files side by side. Exploring unfamiliar codebases requires sustained concentration over extended sessions, making visual clarity, predictable navigation, and low eye fatigue essential product requirements.

Standard web layouts with fixed page scrolling cannot support dense developer workflows. An effective code visualizer requires a flexible multi pane workspace where developers can adjust the balance between the architectural canvas, source files, and symbol inspectors. Without a unified design system and reliable layout foundation, individual feature slices would invent separate styling rules, inconsistent color values, and fragile custom resize handlers.

Furthermore, developer tools must be accessible to engineers using diverse input modes. Canvas controls, panel handles, and modal dialogs must operate smoothly with keyboard shortcuts, meet strict contrast standards, and announce state changes accurately to assistive technology. Setting these standards early establishes a reliable baseline for every subsequent slice.

## Options considered

### Option 1: Tailored Tailwind CSS v4 tokens with react-resizable-panels, Radix UI headless primitives, and Zustand layout persistence

This approach establishes a semantic design system directly within CSS custom properties using Tailwind CSS v4, pairs it with `react-resizable-panels` for accessible multi pane layouts, uses unstyled Radix UI primitives for dialogs and menus, and coordinates layout state via Zustand with `localStorage` synchronization.

**Pros**:
- Minimal bundle footprint with zero runtime CSS injection overhead.
- Excellent keyboard accessibility and ARIA compliance provided out of the box by `react-resizable-panels` and Radix UI.
- Direct integration with Tailwind CSS v4 theme variables ensures instant styling customization without complex configuration files.
- Decoupled Zustand layout store allows any component to toggle panels or inspect layout state without prop drilling.

**Cons**:
- Requires writing clean Tailwind styling wrappers for base interactive components rather than importing pre styled widgets.

### Option 2: Heavy monolithic component framework (such as Mantine or NextUI)

This option imports an existing comprehensive component library providing ready made buttons, dialogs, split layouts, and dark mode themes.

**Pros**:
- Provides extensive collections of prebuilt widgets with minimal initial boilerplate.

**Cons**:
- Adds substantial runtime bundle weight and styling complexity that can conflict with Tailwind CSS v4.
- Styling custom React Flow nodes, custom canvas controls, and specialized code viewer panes often requires fighting opinionated framework CSS.
- Less flexibility when integrating custom canvas rendering and Monaco Editor dark themes.

### Option 3: Bespoke handcrafted split pane and UI elements with zero external UI packages

This option avoids all external UI libraries, building custom mouse drag listeners for panel resizing and custom HTML dialogs from scratch.

**Pros**:
- Zero additional third party dependencies in `package.json`.

**Cons**:
- Handcrafting smooth pointer drag behavior with touch support, keyboard navigation, and collapse animations is difficult and time consuming.
- High risk of accessibility defects in focus trapping, ARIA roles, and screen reader announcements.
- Diverts engineering effort from the core graph visualization and parsing capabilities.

## Decision

We choose Option 1: Tailored Tailwind CSS v4 design tokens with react-resizable-panels, Radix UI headless primitives, and Zustand layout persistence.

## Rationale

Option 1 provides the optimal balance between engineering velocity, bundle efficiency, and accessibility rigor.

By building on `react-resizable-panels`, we gain battle tested split pane management with full keyboard arrow navigation, minimum pixel constraints, and collapse animations. Pairing this with Tailwind CSS v4 semantic tokens creates an aesthetic developer environment with low eye strain, crisp typography, and unified slate surfaces.

Adopting unstyled Radix UI primitives for dialogs, tooltips, tabs, and menus ensures full WCAG AA compliance without locking the application into a heavy monolithic UI library. Finally, managing layout state in Zustand allows persistent panel sizes across page refreshes while keeping layout state clean and easy to test.
