# 0010. AI Service Stabilization and Fallback Notices: Rationale

## Context

The initial AI query implementation introduced natural language architecture queries with support for Gemini, OpenAI, Claude, and zero cost demo mode. When live external requests fail, the application currently exposes raw provider error strings directly in red alert containers. These failures happen routinely during live usage: user API keys expire, provider quotas get exhausted, IP rate limits kick in, or external provider networks experience downtime.

Exposing raw upstream error strings creates three serious problems. First, raw error dumps from external APIs can leak sensitive authorization tokens, internal endpoint URLs, or raw stack frames into client browser DOM trees. Second, users facing a red error banner receive no actionable path forward: they do not know whether the failure was caused by an empty account balance, an incorrect key, a temporary network blip, or a global outage. Third, users who experience mid stream failures lose the partial text already generated because the interface marks the entire turn as failed without preserving tokens.

Providing reliable stabilization and contextual fallback notices bridges this gap. When something goes wrong, the application must immediately translate raw technical errors into clear categories, sanitize all sensitive data, and provide direct one click remedies like switching to demo mode or updating key settings.

## Options considered

### Option 1: Isomorphic error classification with interactive FallbackNoticeCard and client offline Demo execution (Chosen)

Create an isomorphic pure error classification module that parses HTTP status codes, provider error payloads, and client fetch network exceptions into categorized domain notices. The server scrubs all credentials and sensitive tokens before streaming. The client renders an accessible fallback notice card equipped with tailored action buttons (switch to demo, open keys dialog, or auto retry countdown). When the browser is offline or switches to demo mode upon fallback, `DemoAIProvider` executes directly in client memory, avoiding network dependencies entirely.

**Pros**:
- Upstream credentials and internal stack traces are redacted before leaving the server.
- The interface guides users directly toward recovery instead of leaving them stranded.
- Preserves partial text generated prior to a mid stream failure.
- Decouples error categorization logic from specific UI components for high testability.
- True offline guarantee: Demo mode does not depend on an active connection to the Next.js server.

**Cons**:
- Requires bundling `DemoAIProvider` and static demo fixtures into the client bundle alongside server routes.

### Option 2: Automatic silent fallback to Demo mode on any failure

Whenever a BYOK provider query fails, catch the error silently on the server or client and immediately re run the query through DemoAIProvider, returning the canned demo response with an informational badge.

**Pros**:
- The user always receives a response without clicking anything.

**Cons**:
- Confusing for engineers who brought their own key and expected live analysis of their custom repository; canned demo answers might not reflect their actual code.
- Masks real billing or key issues that require the engineer's attention.

### Option 3: Client only regex error parsing in stream hook

Leave server endpoints unchanged and rely purely on client side regex matching inside `useAiQueryStream` or `TracePanel` to infer error causes from raw error strings.

**Pros**:
- Avoids backend schema and route changes.

**Cons**:
- Raw provider errors still travel over the network to the browser, risking credential leakage in client logs.
- Brittle regex patterns easily break when upstream providers alter their error wording.

## Decision

**Chosen option**: Option 1: Isomorphic error classification with interactive FallbackNoticeCard and client offline Demo execution.

We build a dedicated isomorphic classification and redaction module alongside an accessible client fallback notice component that offers immediate recovery actions and executes Demo mode in browser memory when offline.

## Rationale

Option 1 provides the safest and most transparent developer experience. Silent fallback (Option 2) violates the principle of predictable system behavior: when an engineer provides their own API key, returning a canned demo answer without clear consent can mislead them about their codebase architecture. Client only error parsing (Option 3) fails our security requirement because raw provider error dumps could contain partial keys or credentials in network payloads.

By classifying failures into four concrete categories (`rate_limit`, `auth_error`, `provider_outage`, `network_timeout`), we sanitize errors at the boundary. The client UI can then render targeted recovery buttons, such as offering an immediate switch to zero cost demo mode when a live provider goes down or showing an active countdown timer when throttled by a rate limit. Running `DemoAIProvider` in client memory ensures that offline exploration remains completely uninterrupted.
