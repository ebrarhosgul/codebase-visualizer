# 0008. Semantic AI Query and Path Tracing (Decision Record)

## Context

Codebase Visualizer enables developers to explore software repositories through an interactive architecture canvas and side by side source code viewer. As repositories grow in size and complexity, understanding how two distant modules relate requires significant manual inspection. Developers need to trace through import statements, directory hierarchies, and function calls across dozens of files. Natural language questions combined with automated path tracing allow developers to query relationships directly, such as asking how the API layer connects to the database or identifying why a specific utility is imported by a background job.

Several competing forces shape this problem space:

First, cost and abuse vectors. Making live calls to state of the art language models incurs direct financial costs and creates vulnerability to denial of service or credit depletion. Offering an unauthenticated public interface with a live model key risks rapid rate exhaustion and unexpected bills. Conversely, requiring every visitor to supply their own API key before trying the application creates significant onboarding friction.

Second, accuracy versus hallucination in graph visualization. Large language models frequently hallucinate plausible looking import chains or module relationships that do not exist in the actual abstract syntax tree. If an AI generated response produces speculative edges on the canvas, user trust in the visualizer is destroyed. Visual path highlights must reflect verifiable dependency chains present in the code.

Third, credential security and client privacy. Developers bringing their own provider keys expect their credentials to remain secure. Storing keys in plain client side storage leaves them accessible to third party browser extensions, while storing them on a remote application database introduces data custody obligations and credential leak liabilities.

Fourth, context window constraints. Production codebases often contain hundreds of files and tens of thousands of lines of code. Serializing entire codebases into an LLM prompt exceeds token limits and wastes budget. The system requires an efficient topological condensation strategy that preserves architectural boundaries without exhausting token quotas.

## Options considered

### Option 1: Client direct streaming with plain local storage credentials

In this architecture, the browser communicates directly with Google, OpenAI, or Anthropic REST endpoints. The user enters their API key in a client settings modal, which is stored in browser local storage. The browser constructs the prompt from local graph data and manages the streaming connection directly.

**Pros**:
- Completely offloads model compute and API billing from the application host.
- Zero server compute overhead or route handler maintenance for streaming proxying.
- Fast direct connection between the browser client and provider endpoints.

**Cons**:
- Exposes raw API keys in browser local storage where malicious browser extensions can access them.
- Requires every user to configure an API key before any query functionality can be sampled.
- Bypasses server side rate limiting and abuse controls.

### Option 2: Provider agnostic route handler proxy with demo mode and encrypted cookie BYOK storage

In this architecture, Next.js route handlers orchestrate query execution. The system features a built in demo mode that serves pre generated responses and traces for sample repositories without live API calls. For custom repositories, users provide their API key, which the server encrypts into an HTTP only cookie. The server communicates with language models through an interchangeable provider interface defaulting to Gemini Flash, validates all proposed path steps against the canonical graph, and streams structured Server Sent Events back to the client.

**Pros**:
- Eliminates billing risk and credential exposure entirely in demo mode for first time visitors.
- Protects user credentials by storing them in encrypted HTTP only cookies inaccessible to client scripts.
- Guarantees visual accuracy by validating model generated paths through deterministic breadth first graph search.
- Avoids vendor lock in by defining a clean interface supporting Gemini, OpenAI, and Claude.

**Cons**:
- Requires Next.js server route handlers to decrypt cookies and proxy streaming responses.
- Encrypted cookie size must stay well within standard browser header limits.

### Option 3: Backend database session store with user accounts

In this architecture, users register accounts and store their encrypted credentials in a centralized relational database. Query sessions, conversation threads, and path traces persist in cloud storage, allowing users to resume past queries across devices.

**Pros**:
- Enables cross device synchronization of query histories and saved path traces.
- Supports centralized team sharing and collaborative architectural investigation.

**Cons**:
- Introduces substantial infrastructure complexity (user authentication, relational databases, session management).
- Violates the stateless developer tool architecture established in earlier project slices.
- Creates severe security liabilities by centralizing third party API keys in a hosted database.

## Rationale

Option 2 is selected as the architectural foundation for semantic AI queries.

The primary rationale centers on eliminating abuse risk and operational cost while maintaining strong security for developers bringing their own keys. The inclusion of a dedicated demo mode addresses onboarding friction by letting users experience architectural explanations and visual path tracing on sample repositories with zero cost and zero live API dependencies.

For active repository exploration, the encrypted HTTP only cookie model provides superior credential hygiene compared to plain local storage (Option 1) without the heavy infrastructure and liability of a centralized database (Option 3). API keys are never stored on the server filesystem or database; they are decrypted in memory during the request and discarded immediately after stream completion.

The provider agnostic interface directly satisfies the requirement for vendor flexibility. Defaulting to Gemini Flash provides high throughput, large context capacity for abstract syntax tree summaries, and cost effective execution, while the clean interface ensures OpenAI and Claude can be swapped in without touching canvas or editor components.

Finally, enforcing deterministic breadth first graph validation (`findDependencyPath`) before rendering canvas highlights ensures that model hallucinations never manifest as false architectural dependencies. This guarantees that visual path highlights remain truthful to the codebase abstract syntax tree.

## Amendment 2026-09-21: security hardening

**Context.** A security review of the shipped code raised four leads and several hardening notes. Anonymous callers could spend an operator LLM key behind a limiter keyed on a client supplied header. The server GitHub token was used for anonymous ingests. Another site could plant a credential cookie with a cross site form post. Archive handling had no size bounds. The review also noted that the cookie secret fell back to a key that was public in the source.

**Decisions.**
- Server credentials. Keep an optional server key as a developer convenience, or remove it. Removed. Any server key is reachable by anonymous callers, and a server GitHub token can read whatever private repositories it is scoped to. Users bring their own keys, and demo mode covers keyless use. The cost is no keyless live mode, and all anonymous GitHub traffic shares one unauthenticated quota (see spec 0005).
- Cookie secret. Keep a development fallback, or fail closed. Fail closed. A fallback that lives in public source protects nothing, and a silent fallback hides a misconfigured deployment.
- Cross site cookie planting. Switching to `SameSite=Strict` was rejected because `SameSite` governs when a cookie is sent, not whether a cross site response may cause it to be stored. Checking `Origin` and `Sec-Fetch-Site` and requiring a JSON content type stops the attack directly. `Lax` stays.
- Cookie contents. The provider was already inside the encrypted payload, so binding it further added nothing. A sealed expiry and a purpose label were added instead, which limit how long a copied value works and stop one cookie being replayed as another.
- Client address. The leftmost `X-Forwarded-For` entry is client controlled and was rejected. The rightmost entry is appended by the nearest trusted proxy. With several proxy hops this shares one bucket, which fails safe.
- Rate limit state. A shared store was deferred. Per process counts slow abuse but are not a global cap, recorded as a follow up.

**Consequence for existing users.** The cookie format changed, so saved keys must be entered once more.
