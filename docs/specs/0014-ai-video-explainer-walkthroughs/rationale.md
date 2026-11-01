# 0014. AI video explainer walkthroughs and canvas state sync: rationale

Decision record for [index.md](index.md). `/develop` does not need this file.

## Context

Codebase Visualizer already lets you ask natural language questions about a repository and inspect dependency paths on the React Flow canvas (spec 0008), recover cleanly from provider errors (spec 0010), maintain 60 FPS canvas performance via viewport pruning and Web Worker layout isolation (specs 0011 and 0012), and explore structural answers in zero friction demo mode (spec 0013). However, when an architectural explanation spans four or five files across multiple layers, reading a static wall of markdown while manually clicking step pills or citation badges forces you to split your attention between the right hand trace panel and the graph canvas.

Scope Feature 14 calls for asynchronous AI video explainer walkthroughs inside the trace panel using a personal video provider API key saved in an encrypted cookie, paired with live canvas node highlighting synchronized to video playback timestamps and clear quota notices when rate limits are reached.

Several forces shape this design:
1. **Asynchronous generation latency**: unlike text streaming where the first token arrives in under a second, generating a narrated 15 to 45 second explainer video via Scrimba Explain (`POST /api/v1/explainers`) takes multiple seconds to tens of seconds and completes asynchronously. Holding a single HTTP request open risks serverless route timeouts.
2. **Credential isolation and security**: the app has no server database or user accounts; user API keys live in AES 256 GCM encrypted HTTP only cookies (`src/lib/ai/crypto.ts`). A user who already saved a Gemini, OpenAI, or Claude key for chat must be able to save a Scrimba key (`scr_live_...`) without overwriting their chat key, and that key must never leak to browser scripts or error logs.
3. **Strict 60 FPS canvas budget**: HTML5 `<video>` fires `timeupdate` several times a second, and users scrub timelines rapidly. If every time tick mutates `useGraphStore`, `ArchitectureCanvas` will re evaluate node and edge arrays continuously and drop frames on 300 plus node repositories.
4. **Graph grounding and filter conflicts**: the full `CodebaseGraph` lives in browser memory inside `useGraphStore` rather than on the server. Upstream video APIs narrate scenes in natural language and may omit or hallucinate internal `CodebaseGraph` node and edge IDs, or target files that the user has collapsed into a `collapsedFolder` node or filtered out by architectural layer. Every timeline cue must resolve deterministically on the client to real graph entities without overriding the user's filter setup behind their back.

## Options considered

### Option 1: Long lived Server Sent Events (SSE) proxy with per frame Zustand time sync

Add a streaming route that calls Scrimba `POST /api/v1/explainers`, holds the HTTP response open while polling Scrimba in a server loop, and emits SSE progress events until the video URL is ready. On the client, sync `video.currentTime` directly into `useGraphStore` via a `requestAnimationFrame` or `timeupdate` listener so `ArchitectureCanvas` computes active nodes on every tick.

**Pros**:
- Reuses the SSE mental model from `/api/ai/query`.
- Only one HTTP endpoint is needed to start and await the video job.

**Cons**:
- Holding a serverless route handler open for 30 to 90 seconds while polling an upstream video generator hits platform execution timeouts and ties up server connections.
- If a transient network blip drops the SSE connection at second 35, the client loses the job handle and must start over.
- Writing `currentTimeSeconds` into `useGraphStore` on every frame or `timeupdate` tick triggers store subscribers repeatedly even when the active chapter cue has not changed.

### Option 2: Dedicated `/api/ai/video` REST initiation + `/api/ai/video/[jobId]` polling with client side cue validation and discrete cue transition sync

Extend `/api/ai/keys` with a separate `cv_ai_key_scrimba` encrypted cookie, expose `POST /api/ai/video` to start the Scrimba Explain job (`202 Accepted`), poll `GET /api/ai/video/[jobId]` with `1.5x` exponential backoff (`4s`, `6s`, `9s`, `10s` cap) up to a 120 second timeout, and validate `VideoTimelineCue` chapters on the client against `useGraphStore.getState().graph`. Render a native HTML5 `<video>` player inline inside `AiQueryMessage` in `TracePanel` whose `timeupdate` and `seeked` listeners run `findActiveCueIndex` and dispatch `setVideoCueHighlight` to `useGraphStore` only when `activeCueIndex` changes.

**Pros**:
- Each HTTP request completes in milliseconds, avoiding serverless timeouts and making retries idempotent if a single poll fails.
- Updating `useGraphStore` only on discrete chapter transitions (3 to 6 times per video) and keeping high frequency media state local to `VideoWalkthroughPlayer` keeps `ArchitectureCanvas` completely idle between cue boundaries, preserving the 60 FPS budget from specs 0011 and 0012.
- Running `buildValidatedVideoCues` on the client against `CodebaseGraph` avoids uploading megabytes of graph JSON to the server while guaranteeing every cue interval is contiguous and every `nodeId` and `edgeId` exists in `CodebaseGraph`.
- Separate `cv_ai_key_scrimba` cookie preserves existing chat provider keys.

**Cons**:
- Requires two route handlers (`POST /api/ai/video` and `GET /api/ai/video/[jobId]`) plus client polling lifecycle management (`AbortController`, backoff timer, and timeout handling).
- Adds a third `highlightSource` value (`"video"`) to `useGraphStore` alongside `"trace"` and `"answer"`.

### Option 3: Third party media player library with WebVTT (`TextTrack`) cue orchestration

Use a third party player package (such as Video.js or Media Chrome) and encode `VideoTimelineCue` payloads as JSON strings inside an in memory WebVTT `Blob` attached to a `<track kind="metadata">` element, driving canvas highlights from browser `oncuechange` events.

**Pros**:
- Delegates cue boundary detection to the browser's built in WebVTT track engine.
- Provides prebuilt player skins out of the box.

**Cons**:
- Adds unnecessary client bundle weight and CSS overrides to match the dark mode tokens in `design.md`.
- Serializing typed `VideoTimelineCue` records into VTT text blobs and parsing JSON back out on `cuechange` adds indirection, complicates unit testing in JSDOM (where `TextTrack` cue firing is incomplete), and makes interactive chapter markers on the timeline bar harder to customize.

## Rationale

Option 2 is chosen because it directly addresses every operational force without adding external player dependencies or fragile long lived server connections.

First, separating initiation (`POST /api/ai/video` returning `202 Accepted`) from status polling (`GET /api/ai/video/[jobId]`) matches how asynchronous media generation works in production. Each poll is a fast stateless read that decrypts `cv_ai_key_scrimba` from the request cookie, checks Scrimba `GET /api/v1/explainers/[jobId]`, and returns the normalized status. If one poll experiences a network hiccup, the next poll recovers transparently without losing the job or double charging the user's Scrimba quota.

Second, isolating `cv_ai_key_scrimba` into its own cookie with purpose tag `"video-key"` avoids a subtle UX trap in `src/app/api/ai/keys/route.ts`. Today `cv_ai_key` stores a single `{ apiKey, provider }` pair for the text chat model. If saving a Scrimba key overwrote `cv_ai_key`, a user who configured Gemini for architectural Q&A and then added a Scrimba key for video walkthroughs would suddenly lose their Gemini key on the next chat prompt. Two cookies sharing the same AES 256 GCM helpers in `src/lib/security/cookie-crypto.ts` keep both capabilities working side by side.

Third, driving `useGraphStore` strictly on discrete `activeCueIndex` changes protects the canvas frame budget. A 30 second walkthrough with 5 chapters changes its active cue only 5 times during linear playback. Keeping the high frequency `currentTimeSeconds` and `isPlaying` state local to `VideoWalkthroughPlayer` (for the progress bar readout) while dispatching `setVideoCueHighlight` to `useGraphStore` only when `nextCueIndex !== activeCueIndex` means `ArchitectureCanvas` runs its node and edge styling effects only at chapter boundaries.

Finally, running `buildValidatedVideoCues` on the client ensures canvas synchronization never breaks when upstream video metadata is sparse. By intersecting candidate IDs against `graph.files`, `graph.symbols`, and `graph.edges` in browser memory and falling back to proportional time slicing across the verified `PathTrace` hops or message citations, every chapter cue is guaranteed to highlight real nodes on the canvas, resolve `collapsedFolder` and `folderGroup` containers cleanly (`hasActiveChild`), and respect manual camera panning (`isVideoAutoPanEnabled`).

## Cross check adjustments

A read only cross check pass on Gemini Flash 3.8 surfaced eight decision completeness gaps and six codebase compatibility issues in the initial draft, all folded into `index.md` and the rationale above:

- **Client side cue validation**: clarified that `POST /api/ai/video` and `GET /api/ai/video/[jobId]` return raw `upstreamScenes` while `buildValidatedVideoCues` runs on the client against `useGraphStore.getState().graph`, avoiding uploading the full graph to the server.
- **Scrimba upstream wire contracts**: added explicit `ScrimbaCreateExplainerRequest` and `ScrimbaExplainerStatusResponse` schemas in `Feature design`.
- **Offline demo video asset**: replaced the invalid SVG data URI suggestion with an in memory base64 WebM/MP4 `Blob` URL (`DEMO_WALKTHROUGH_VIDEO_BASE64`) scoped strictly to `facebook/react` (`isVideoDemoRepository`).
- **Rate limiter window and polling backoff math**: parameterized `checkWindow(ip, maxRequests, windowMs?)` in `src/lib/ai/rate-limiter.ts` and specified `delayMs = Math.min(10000, Math.round(4000 * Math.pow(1.5, pollAttempt)))` with HTTP 200 on intermediate polls.
- **Player placement, paused mount, and `KeySettingsDialog` props**: pinned `VideoWalkthroughPlayer` inline inside `AiQueryMessage` starting paused at `0:00`, made the input bar video toggle sticky per session, and added `initialProvider?: AiProviderId | "scrimba"` to `KeySettingsDialogProps`.
- **Codebase soundness**: included `n.type === "collapsedFolder"` alongside `folderGroup` in `ArchitectureCanvas`, enabled edge glow when `highlightSource === "video"`, added `"video"` to `selectNode`, `navigateToTarget`, and `TracePanel` "Clear Glow" guards, widened `ClassifyErrorInput.provider` to include `"scrimba"` with `suggestedAction: "retry"` on 429s, and trimmed high frequency playback fields out of `useGraphStore`.
