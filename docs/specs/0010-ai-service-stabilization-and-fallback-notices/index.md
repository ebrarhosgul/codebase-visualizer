# 0010. AI Service Stabilization and Fallback Notices

**Date**: 2026-09-09
**Status**: In Progress

## Summary

This specification hardens the AI architecture query service against rate limits, invalid API keys, and upstream provider outages. It replaces raw error text with classified, actionable fallback notices and one click recovery triggers in the trace interface. The system introduces isomorphic error classification to handle both server and client network exceptions, client side execution for zero cost Demo mode during offline conditions, and automated query retention for rate limit retries.

## Context

Reasoning and options: see [rationale.md](rationale.md).

## Requirements

**User stories**:
- As a developer testing repositories without an API key, I want Demo mode to answer architectural queries reliably even when offline so that my exploration never gets blocked by network drops or provider disruptions.
- As an engineer bringing my own API key, I want clear, friendly explanations when queries hit rate limits or provider downtime so that I understand what went wrong without seeing raw JSON stack dumps.
- As an active user whose query fails halfway through generation, I want the system to preserve already streamed prose and offer one click recovery actions (such as switching to Demo mode or adjusting keys) so that I do not lose context.

**Acceptance criteria**:
- **AC-1**: When an AI query encounters a failure before or during streaming, the system classifies the error into one of four domain categories (`rate_limit`, `auth_error`, `provider_outage`, `network_timeout`), returning a sanitized message and recovery metadata.
- **AC-2**: The trace panel renders a dedicated `FallbackNoticeCard` instead of raw red error text, presenting the sanitized failure explanation, appropriate icon, and direct action triggers.
- **AC-3**: For rate limit failures, the fallback notice displays an active countdown timer with auto retry support alongside an immediate Switch to Demo Mode button; for authentication errors, it provides a direct button to open the Key Settings dialog.
- **AC-4**: All upstream provider error payloads pass through a server side redaction sanitizer that scrubs API keys, authorization tokens, internal addresses, and unformatted stack traces before reaching client streams or responses.
- **AC-5**: Demo mode executes with a zero network guarantee by running `DemoAIProvider` directly on the client when offline or upon fallback, resolving queries through local static fixtures and graph traversal without network fetch attempts.

## Decision

**Chosen option**: Isomorphic error classification module with structured fallback metadata, client side offline Demo execution, and an accessible FallbackNoticeCard.

We introduce an isomorphic pure function module (`src/lib/ai/error-classifier.ts`) that inspects HTTP status codes, provider error bodies, and client side fetch network exceptions, returning typed `AiFallbackNotice` structures with credential redaction. When operating in Demo mode or when network drops occur (`navigator.onLine === false`), the client hook (`useAiQueryStream`) executes `DemoAIProvider` directly in the browser runtime, bypassing the server endpoint entirely. For live BYOK queries, route handlers emit structured JSON or SSE errors that the client parses into message state. An accessible `FallbackNoticeCard` subcomponent renders inline inside `TracePanel`, offering one click recovery pathways while preserving partial streamed text.

**Implementation skills**: `modern-web-guidance` (`modern-web-guidance-plugin`, `~/.gemini/config/plugins/modern-web-guidance-plugin/skills/modern-web-guidance/`) · `gemini-api-dev` (`google-gemini/gemini-api`, `~/.gemini/config/plugins/gemini-api/skills/gemini-api-dev/`)

## Feature design

**Data model sketch**:
- `AiFallbackNotice`: Embedded value object in `src/lib/ai/types.ts`. Fields: `code` (`"rate_limit"` | `"auth_error"` | `"provider_outage"` | `"network_timeout"` | `"unknown"`), `title` (string), `message` (string), `suggestedAction` (`"switch_demo"` | `"open_keys"` | `"retry"` | `"none"`), `retryAfterSeconds` (optional number), `provider` (optional `AiProviderId`).
- `AiQueryMessage` (extended): Existing message interface in `src/lib/ai/types.ts` updated with optional `fallbackNotice?: AiFallbackNotice | null`. Persisted in browser `sessionStorage` under `cv:thread:{repoFullName}`.
- `AIStreamEvent` (extended error variant): Existing error event in `src/lib/ai/types.ts` extended with optional `code?: AiFallbackCode`, `suggestedAction?: AiFallbackAction`, and `retryAfterSeconds?: number`.

**State transitions**:
- Query execution: `idle` → `validating` → `streaming` → `complete`.
- Pre stream failure: `validating` → `error` (route returns 401, 429, or 400 with structured JSON body; hook creates message with `fallbackNotice`).
- Mid stream failure: `streaming` → `error` (SSE emits `event: error` chunk with notice fields; hook keeps accumulated text and attaches `fallbackNotice`).
- Fallback recovery:
  - On "Switch to Demo Mode" click: switches provider to demo, aborts active connection, and immediately runs `DemoAIProvider` directly in client memory.
  - On "Open Key Settings" click: opens `KeySettingsDialog` modal to let user update or clear credentials.
  - On "Retry" click or countdown expiry: clears previous `fallbackNotice` and partial text from the message, aborts pending connections, and resubmits query using cached options in `lastQueryOptionsRef`.

**API surface**:
| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/api/ai/query` | POST | `repository`, `messages`, `contextSummary`, `graph`, `provider` (or legacy `isDemo`) | SSE stream (`text`, `trace`, `citations`, `warning`, `error`, `done`) or JSON on pre stream error | Optional encrypted cookie for BYOK | 400 validation error, 401 auth failure with notice JSON, 429 rate limit with notice JSON and Retry-After, 502 provider outage |
| `/api/ai/keys` | POST | `provider`, `apiKey` | `{ success: true, provider }` with encrypted cookie | Public | 400 unsupported provider or empty key |
| `/api/ai/keys` | DELETE | None | `{ success: true }` clearing cookie | Public | 200 ok |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Classify failure | Fallback error category code | Derived by isomorphic `classifyError` in `src/lib/ai/error-classifier.ts` from HTTP status, error message, or client fetch exception |
| Display notice | Friendly error explanation | Derived by `classifyError` sanitized message templates |
| Display countdown | Remaining wait seconds | Sourced from `retryAfterSeconds` in API response or default 60 second bucket |
| Render recovery actions | Available button triggers | Sourced from `fallbackNotice.suggestedAction` |
| Switch mode | Offline demo answers | Sourced from client execution of `DemoAIProvider` using static fixtures and BFS graph traversal |
| Redact secrets | Sanitized error string | Computed by regex replacement in `sanitizeErrorMessage` |
| Re trigger query | Resubmitted request payload | Cached in `useAiQueryStream` via internal `lastQueryOptionsRef` |

**Key invariants**:
- Upstream credentials, raw internal URLs, and Node stack traces must never appear in client error banners or SSE error events.
- Demo mode must never make external network calls, ensuring complete offline availability and zero credit consumption.
- If a stream aborts or encounters an error mid generation, all tokens already delivered to the client remain visible above the fallback notice card until a retry is initiated.
- Initiating a retry or mode switch resets the target message state and immediately aborts prior in flight network controllers before starting the new stream.

**Security model**:
- Credential protection: All provider error messages pass through `sanitizeErrorMessage` which strips patterns matching `AIza[0-9A-Za-z-_]{35}`, `sk-[0-9A-Za-z]{20,}`, `Bearer [^ ]+`, and query parameters.
- Rate limiting: Maintained at 30 requests per minute for BYOK and 10 requests per minute for Demo mode per client IP address, returning standardized `Retry-After` HTTP headers.
- Cookie confidentiality: BYOK API keys remain encrypted with AES-256-GCM in HTTP only cookies, never exposed to client JavaScript.

**Configuration required**:
- No new environment variables required. Existing `GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, and `AI_COOKIE_SECRET` continue to operate.

**Critical test scenarios**:
- Rate limit handling: User sends queries exceeding rate limit; server returns 429 with `Retry-After`; UI renders `FallbackNoticeCard` with active countdown and Switch to Demo button, verifying **AC-1**, **AC-2**, **AC-3**.
- Auto retry execution: Countdown timer reaches zero with auto retry checked; `useAiQueryStream` uses cached `lastQueryOptionsRef` to automatically re submit without user input, verifying **AC-3**.
- Missing or invalid key recovery: User submits BYOK query with invalid key; server returns 401 with `auth_error` code; UI renders fallback card with Open Key Settings button, verifying **AC-1**, **AC-2**, **AC-3**.
- Provider outage and mid stream failure: Provider throws 503 after emitting text; stream emits structured `error` event; UI preserves partial text and offers Switch to Demo button, verifying **AC-1**, **AC-2**, **AC-4**.
- Credential redaction: Upstream error containing mock API key is intercepted; sanitizer redacts key before client delivery, verifying **AC-4**.
- Offline demo operation: Browser offline (`navigator.onLine = false`); query in Demo mode executes entirely on client via `DemoAIProvider` without making fetch calls, generating answer and BFS path trace successfully, verifying **AC-5**.

## Build plan

Ordered per Tracer Bullet approach (thin end to end thread through every layer first, then thickened with recovery controls, sanitization, and offline guards):

1. [x] **Isomorphic error classification & typed SSE schemas** (`src/lib/ai/types.ts`, `src/lib/ai/error-classifier.ts`):
   - Define `AiFallbackNotice`, `AiFallbackCode`, and `AiFallbackAction` types.
   - Implement `classifyError` pure function to map status codes, error strings, and client fetch `TypeError`s to safe domain codes.
   - Extend `AIStreamEvent` error payload and update `/api/ai/query` route to emit structured JSON and SSE error chunks.
   - Satisfies: **AC-1**, **AC-4**.

2. [x] **Client stream hook and fallback card primitive** (`src/hooks/use-ai-query-stream.ts`, `src/components/trace/fallback-notice-card.tsx`):
   - Update `useAiQueryStream` to cache arguments in `lastQueryOptionsRef` and parse structured errors, dispatching `onErrorNotice` callback.
   - Build `FallbackNoticeCard` component with accessible alert roles, status badge, sanitized description, and recovery button slots.
   - Mount `FallbackNoticeCard` in `TracePanel` beneath message content, preserving partial text.
   - Satisfies: **AC-1**, **AC-2**.

3. [x] **Interactive recovery triggers & countdown mechanic** (`src/components/trace/fallback-notice-card.tsx`, `src/components/trace/trace-panel.tsx`):
   - Implement countdown timer with auto retry checkbox for rate limit notices.
   - Add one click action handlers: switch to demo mode with auto re submission, open `KeySettingsDialog`, and manual retry.
   - Guard against concurrent clicks by aborting previous stream controllers before initiating new queries.
   - Satisfies: **AC-2**, **AC-3**.

4. [x] **Credential redaction & client offline demo execution** (`src/lib/ai/error-classifier.ts`, `src/hooks/use-ai-query-stream.ts`, `src/components/trace/trace-panel.tsx`):
   - Add regex scrubbing for API keys, bearer tokens, and internal stack frames.
   - Route offline demo queries directly to `DemoAIProvider` in client memory when `navigator.onLine === false` or when falling back from a network error.
   - Satisfies: **AC-4**, **AC-5**.

5. [x] **Automated test suite & verification** (`src/lib/ai/__tests__/error-classifier.test.ts`, `src/app/api/ai/__tests__/routes.test.ts`, `src/hooks/__tests__/use-ai-query-stream.test.ts`, `src/components/trace/__tests__/trace-panel.test.tsx`):
   - Unit test isomorphic error classification and credential scrubbing.
   - Integration test route handler rate limit and error responses.
   - Component test `FallbackNoticeCard` rendering, countdown timer, and recovery action dispatchers.
   - Satisfies: **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-5**.

## Consequences

- **Positive**:
  - Raw JSON dumps and intimidating red error boxes are replaced by actionable, friendly recovery choices.
  - Zero cost Demo mode gives users an immediate alternative when live providers are slow, down, or quota exhausted.
  - Client side execution of Demo mode guarantees total offline availability even when server network access is down.
  - Accidental exposure of API keys or server stack traces in error messages is eliminated.
  - Partial text responses are saved rather than wiped when mid stream network blips happen.
- **Tradeoffs**:
  - Adds a small amount of client state in message entities (`fallbackNotice`).
  - Upstream provider specific errors may be mapped to generalized categories, slightly reducing debugging detail in production client views (though full detail can remain in server logs).

## Follow-up

- [ ] Connect upstream telemetry or analytics logging for categorized AI provider errors once persistent user accounts are built.
