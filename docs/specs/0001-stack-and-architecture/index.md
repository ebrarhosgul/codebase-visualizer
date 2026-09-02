# 0001. Stack and Architecture for Codebase Visualizer

**Date**: 2026-09-02
**Status**: In Progress

## Summary

This decision establishes the core technology stack for Codebase Visualizer. We adopt Next.js 15 with TypeScript, React Flow for interactive graph visualization, ts-morph for abstract syntax tree parsing, and Monaco Editor for side by side code inspection. This gives us a unified full stack runtime that handles repository ingestion, fast interactive graph rendering, and rich code navigation in one codebase.

## Decision

**Chosen option**: Option 1: Next.js 15 Full Stack with React Flow, ts-morph, Monaco Editor, Tailwind CSS, and Zustand.

We choose a unified Next.js 15 TypeScript full stack application using React Flow for graph canvas rendering, ts-morph for abstract syntax tree parsing, Monaco Editor for source code viewing, Tailwind CSS with Radix UI primitives for interface styling, Zustand for reactive client state, and IndexedDB for local graph caching.

To address serverless execution constraints and browser responsiveness:
1. ts-morph executes using an in memory virtual file system with a defensive cap of 500 source files to eliminate server disk writes and avoid memory exhaustion.
2. Dagre layout calculations run inside a client Web Worker to keep the browser UI thread responsive during graph recomputations.
3. React Flow employs hierarchical module clustering so high level architecture renders first, keeping DOM node count optimal.

## Proposed stack

| Layer | Choice | Reason |
|---|---|---|
| Language | TypeScript 5 | End to end type safety across AST definitions, graph models, and UI state |
| Framework | Next.js 15 App Router | Unified React full stack runtime with server route handlers for ingestion |
| Graph Canvas | React Flow (@xyflow/react) | Interactive node graph canvas with custom React components and smooth zoom |
| Graph Layout Engine | Dagre (@dagrejs/dagre) in Web Worker | Fast hierarchical layout calculated off the main thread to avoid UI lag |
| Parser Engine | ts-morph with in memory virtual FS | Accurate AST traversal and symbol extraction without temporary disk writes |
| Code Viewer | Monaco Editor (@monaco-editor/react) | VS Code grade source viewer with rich line decoration and scroll control |
| UI and Styling | Tailwind CSS v4 with Radix UI | Fast utility styling with accessible drawers, dialogs, and split panes |
| Split Layout | react-resizable-panels | Smooth, keyboard accessible split view between graph canvas and code editor |
| Client State | Zustand | Lightweight store synchronizing node selection, active symbols, and panel state |
| Client Cache | IndexedDB via idb-keyval | Persistent client storage for parsed repository graphs without size limits |
| Ingestion Pipeline | Next.js Route Handlers with SSE | Streams repository ingestion and parsing progress stages without CORS issues |
| AI Integration | Vercel AI SDK | Streaming natural language architecture queries with tool calling support |
| Testing | Vitest and Playwright | Fast unit testing for AST parsers and reliable browser testing for graph canvas |

## Consequences

**Positive**:
- Single repository and single deployment target minimize maintenance and operational burden.
- Native React nodes in React Flow allow seamless integration with our design system and Tailwind styling.
- Accurate AST parsing through ts-morph ensures robust symbol resolution and reliable deep linking.
- In memory parsing and Web Worker execution safeguard serverless and browser thread limits.
- Zero server database dependencies keep hosting costs minimal and privacy high for public repositories.

**Negative / tradeoffs**:
- Monaco Editor introduces a large client bundle, requiring dynamic loading and code splitting.
- Repositories larger than the 500 source file cap will need directory filtering or pagination to fit within route handler memory.
- ts-morph is specialized for JavaScript and TypeScript; supporting languages like Python, Go, or Rust in future phases will require additional parser engines.

**Neutral**:
- Client caching in IndexedDB requires explicit versioning and cache invalidation controls when repositories update on GitHub.

## Follow-up

- [x] Scaffold the project using Next.js 15 App Router, TypeScript, and Tailwind CSS v4 in Foundation step 1.
- [ ] Establish linting, formatting, and test tooling via Vitest in Foundation step 2.
- [ ] Define the domain data model for repository nodes, files, and import edges in Foundation step 3.
- [ ] Implement a Web Worker wrapper for Dagre graph layout calculations during Slice 1.
- [ ] Evaluate dynamic code splitting and preloading strategies for Monaco Editor before building Slice 1.
