# Codebase Visualizer

## Stack

- **Language / Runtime**: TypeScript 5, Node.js 22
- **Framework**: Next.js 15 App Router, React 19
- **Key dependencies**: React Flow (@xyflow/react), ts-morph, Monaco Editor (@monaco-editor/react), Tailwind CSS v4, Zustand
- **Package manager**: npm

## Build approach

Tracer Bullet (prove the whole pipe works with a thin end to end slice before thickening any part).

## Commands

```bash
# Install
npm install

# Dev server
npm run dev

# Build
npm run build

# Lint
npm run lint

# Test
npm test
```

## Specs

Stored in `docs/specs/`. Format: `docs/specs/NNNN-title/index.md`.

## Rules

- Pure functions by default with no shared mutable state. Module level variables are constants only.
- Data is immutable. Use `const`, `readonly`, or immutable structures, and never mutate in place.
- Side effects like network, storage, or DOM updates stay at the system edges.
- Prefer function composition over class inheritance. Avoid classes where functions suffice.
- Use explicit result types or error returns rather than throwing exceptions for predictable failures.
- Organize code by feature: colocate components, hooks, utilities, and types in `src/<feature>/`.
- Strict TypeScript: no `any` types, strict null checks, and exhaustive type narrowing.
- Public APIs need concise documentation comments on exported functions, types, and interfaces.
- Validate environment variables when the application starts up.
- Conventional commits with clear headers like `feat:`, `fix:`, `docs:`, or `refactor:`.

## Tooling

- Linter and formatter: ESLint with Prettier (installed by `/develop tooling`)
- Pre commit checks: lint, format check, and typecheck before commit
- Testing gate: unit and integration tests with Vitest
- Continuous integration: GitHub Actions CI on push and pull request

## Git

- integration: on
- branch prefix: feat/
- commit: per-milestone

## Agent skills

- [modern-web-guidance](~/.gemini/config/plugins/modern-web-guidance-plugin/skills/modern-web-guidance/): `modern-web-guidance`, modern web standards, UI patterns, and accessibility
- [chrome-devtools](~/.gemini/config/plugins/chrome-devtools-plugin/skills/chrome-devtools/): `chrome-devtools`, browser automation, network inspection, and debugging

MCP servers: none connected

## Context files

<!-- Nested AGENTS.md files are listed here as they are created -->

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
