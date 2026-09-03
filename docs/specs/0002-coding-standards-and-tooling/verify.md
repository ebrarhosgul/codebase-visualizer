# Verify: Coding standards and tooling (updated September 2, 2026)

_Steps to confirm tooling runs clean. check verify runs these; test locks the durable ones._

## Commands

- [ ] `npm run lint` → passes without errors or warnings
- [ ] `npm run format:check` → passes with all files formatted
- [ ] `npm run typecheck` → passes with no TypeScript errors
- [ ] `npm test` → Vitest passes test suite
- [ ] `npm run build` → Next.js production build succeeds
- [ ] `git commit` → pre commit hook triggers typecheck and lint-staged
