# Verify: Stack & architecture · spec 0001 · updated 2026-09-02

_Steps derived from spec 0001 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual

- [ ] Visit `http://localhost:3000` after starting the dev server, expect landing page with Next.js 15 and Tailwind CSS styling (AC-1)

## Commands

- [ ] `npm run build` expect clean Next.js build with static route generation (AC-1)
- [ ] `npm run lint` expect clean ESLint check with zero errors (AC-1)

## Acceptance criteria coverage

- AC-1 (Scaffold boots locally and passes build) covered by `npm run build` and `npm run dev`
