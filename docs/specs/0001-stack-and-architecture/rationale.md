# 0001. Stack and Architecture Rationale

## Context

Codebase Visualizer turns public GitHub repositories into interactive architecture maps, helping engineers inspect module dependencies and explore code side by side with structural graphs. Building this tool requires solving several technical demands simultaneously:

First, graph rendering must remain fluid and responsive. Visualizing hundreds or thousands of files, modules, and call edges requires a graph engine capable of smooth panning, zooming, node dragging, and custom rendering without degrading frame rates.

Second, code parsing requires deep structural understanding. Extracting accurate imports, exports, symbol definitions, and call relationships from TypeScript and JavaScript files demands an abstract syntax tree parser that tracks source code positions reliably.

Third, the code viewing experience must feel natural to software developers. When a user clicks a node in the graph, the source viewer must jump to the exact file and declaration line with syntax highlighting and line indicators.

Fourth, operational overhead must remain minimal. The project should run as a unified application without demanding separate backend microservices or expensive dedicated databases for public repository inspection.

## Options considered

### Option 1: Next.js 15 Full Stack with React Flow, ts-morph, and Monaco Editor

A unified full stack architecture using Next.js 15 App Router and TypeScript. React Flow handles the interactive graph canvas with custom React nodes. ts-morph executes AST extraction in Node.js server route handlers and streams progress via Server Sent Events. Monaco Editor provides developer grade side by side code inspection. Zustand coordinates client state across graph and code views, while IndexedDB caches parsed graphs in the browser.

**Pros**:
- Single language and unified codebase eliminate API boundary drift and deployment complexity.
- React Flow provides rich custom nodes using native React components, built in zoom controls, and active community support.
- ts-morph wraps the official TypeScript compiler, delivering battle tested symbol tracking and accurate file positions.
- Monaco Editor offers a first class VS Code experience with line decorations and smooth programmatic scrolling.
- Client side caching via IndexedDB eliminates redundant server parsing and keeps cloud hosting costs near zero.

**Cons**:
- Monaco Editor has a substantial bundle size, requiring dynamic import to protect initial page load speeds.
- Server route handlers running heavy AST parsing on very large repositories could encounter memory constraints if not bounded.

### Option 2: Standalone React Single Page Application with Dedicated Node.js Backend

A decoupled architecture featuring a Vite React single page application for the frontend and a standalone Express or Fastify server for AST parsing and repository cloning. Cytoscape.js powers the graph canvas, Babel parser handles code extraction, and CodeMirror serves as the code editor.

**Pros**:
- Clean separation of concerns allows scaling the parser backend independently from the frontend client.
- Cytoscape.js has mature graph algorithms for clustering and complex automated layouts.
- CodeMirror is significantly lighter in bundle size than Monaco Editor.

**Cons**:
- Managing two separate deployment targets and codebases adds operational overhead and CI complexity for a small team.
- Babel parser produces raw ASTs but lacks built in symbol resolution and type reference tracking.
- Cytoscape.js relies on canvas or WebGL drawing rather than native React component trees for custom nodes.

### Option 3: Pure Browser Client with WebAssembly Tree Sitter and PixiJS

A client only static application that fetches repositories directly through the browser GitHub REST API, compiles Tree sitter to WebAssembly for in browser parsing, renders the graph using a PixiJS WebGL canvas, and displays code via Shiki.

**Pros**:
- Zero backend server execution costs since all parsing and rendering happen inside the user browser.
- PixiJS handles tens of thousands of visual nodes with raw 60 frames per second WebGL performance.
- Tree sitter grammars can support multiple languages such as Python, Go, and Rust in the future.

**Cons**:
- Strict browser rate limits on unauthenticated GitHub API calls constrain repository ingestion.
- Building custom interactive UI controls, node selection states, and badges in raw PixiJS requires massive custom development effort.
- Large WebAssembly binaries and in browser parsing can cause UI thread stuttering or high memory usage on mobile or lower power laptops.

## Rationale

Next.js 15 provides the most productive foundation for Codebase Visualizer. It combines React 19 client components for rich interactive graph exploration with Node.js server route handlers for secure, CORS free GitHub repository fetching and AST parsing.

React Flow is chosen over Cytoscape and raw WebGL because its nodes are native React components. This allows us to embed interactive badges, status indicators, export counts, and collapse buttons directly into graph nodes using our standard design system. Module clustering ensures the canvas groups files into folder modules by default, keeping DOM elements responsive.

The TypeScript Compiler API via ts-morph is selected because it understands JavaScript and TypeScript semantics natively. Using an in memory virtual file system avoids server disk dependencies and allows running inside serverless route handlers without touching temporary disk storage.

Monaco Editor provides the code inspection experience developers already expect from VS Code. Its rich line decoration API makes it simple to highlight execution paths, symbol definitions, and AI query results.

Zustand and IndexedDB provide instant client side coordination and persistence. Once a repository is parsed, its graph persists across page reloads in IndexedDB, giving users zero latency navigation without requiring a persistent cloud database.

Dagre calculations offloaded to a Web Worker guarantee smooth user interaction while layout coordinates calculate in the background.
