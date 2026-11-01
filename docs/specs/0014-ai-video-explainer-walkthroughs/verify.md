# Verify: AI video explainer walkthroughs and canvas state sync · spec 0014 · updated 2026-11-01

_Steps derived from spec 0014 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual

- [ ] Open Key Settings dialog → expect grouped sections for Chat Providers and Video Provider with a separate Scrimba key input and save button → AC-1
- [ ] Submit a valid Scrimba key starting with `scr_live_` → expect an encrypted `cv_ai_key_scrimba` cookie created with SameSite Strict without altering existing `cv_ai_key` → AC-1
- [ ] Click Clear Key for Scrimba in Key Settings dialog → expect `DELETE /api/ai/keys?scope=video` clears only the video cookie leaving chat cookies intact → AC-1
- [ ] Load sample repository `facebook/react` without a Scrimba key and click Generate Video Walkthrough on an assistant message card → expect instant completion using an in memory WebM Blob URL and contiguous cues with zero network calls → AC-3
- [ ] Load a custom repository like `vercel/next.js` without a Scrimba key and click Generate Video Walkthrough → expect an auth notice card showing that a video key is needed with a button to open key settings → AC-3
- [ ] Toggle the sticky Video Walkthrough switch in the trace input bar and submit a question → expect video walkthrough generation to start automatically when the answer text finishes streaming → AC-2
- [ ] Save a Scrimba key on a custom repository and click Generate Video Walkthrough → expect `POST /api/ai/video` returns status 202 and polling begins with an elapsed timer and chapter preview cards → AC-4, AC-5
- [ ] Let polling complete → expect the inline HTML5 player to mount paused at zero seconds with play pause, scrubber, active caption, and auto pan switch → AC-5, AC-7
- [ ] Play or scrub the video across chapter boundaries → expect React Flow node and edge highlights to update only when crossing cue intervals with non active nodes dimmed and active edges animated in cyan → AC-8
- [ ] Drag or zoom the React Flow canvas manually while video playback is active → expect auto pan canvas to flip to off, camera motion to stop fighting you, and a Resume sync button to appear → AC-9
- [ ] Click the Resume sync button in the video player → expect auto pan to turn back on and the camera to smoothly re center on the active cue focal node → AC-9
- [ ] Play a cue whose focal node resides in a collapsed folder or folder group → expect the visible folder container node to highlight and center in the canvas viewport → AC-10
- [ ] Filter the canvas so active cue nodes are hidden → expect the player footer to show how many cue nodes are hidden with a Show all button that resets filters and expands folders → AC-10
- [ ] Simulate an upstream 429 rate limit response from Scrimba → expect a rate limit notice card displaying a live countdown timer and retry action → AC-11
- [ ] Trigger a network timeout past 120 seconds or a media playback error → expect a network timeout or refresh video banner with manual chapter stepping remaining functional → AC-11
- [ ] Select a canvas node, click Clear Glow in the trace panel, switch repositories, or clear chat → expect active video highlights to clear and active polling to abort immediately → AC-12

## Commands

- [ ] `/usr/local/bin/node ./node_modules/vitest/vitest.mjs run src/lib/ai/video/__tests__/cue-mapper.test.ts` → passes with interval validation, ID pruning, and boundary cases verified → AC-6
- [ ] `/usr/local/bin/node ./node_modules/vitest/vitest.mjs run src/lib/ai/video/__tests__/url-validator.test.ts` → passes with allowed origins and safe media URIs verified → AC-5
- [ ] `/usr/local/bin/node ./node_modules/vitest/vitest.mjs run src/lib/ai/__tests__/crypto-video.test.ts` → passes with purpose tag isolation between chat and video cookies verified → AC-1
- [ ] `/usr/local/bin/node ./node_modules/vitest/vitest.mjs run src/app/api/ai/keys/__tests__/route.test.ts` → passes with Scrimba key validation and scoped cookie deletion verified → AC-1
- [ ] `/usr/local/bin/node ./node_modules/vitest/vitest.mjs run src/app/api/ai/video/__tests__/route.test.ts` → passes with rate limiting, error classification, and redaction verified → AC-4, AC-5, AC-11
- [ ] `/usr/local/bin/node ./node_modules/vitest/vitest.mjs run src/hooks/__tests__/use-video-walkthrough.test.ts` → passes with demo fallback, polling backoff, and timeout verified → AC-3, AC-5, AC-11
- [ ] `/usr/local/bin/node ./node_modules/vitest/vitest.mjs run src/components/trace/__tests__/video-walkthrough-player.test.tsx` → passes with discrete cue updates, pause on drag, and resume sync verified → AC-7, AC-8, AC-9, AC-10
- [ ] `/usr/local/bin/node ./node_modules/vitest/vitest.mjs run src/components/canvas/__tests__/video-canvas-sync.test.tsx` → passes with canvas highlight dimming, edge animation, and collapsed folder centering verified → AC-8, AC-10
- [ ] `/usr/local/bin/node ./node_modules/typescript/bin/tsc --noEmit` → typecheck completes with zero errors across the entire codebase
- [ ] `npm run lint` → ESLint completes with zero errors and zero warnings

## Acceptance-criteria coverage

- AC-1: covered by UI steps 1, 2, 3 and Command steps 3, 4
- AC-2: covered by UI step 6
- AC-3: covered by UI steps 4, 5 and Command step 6
- AC-4: covered by UI step 7 and Command step 5
- AC-5: covered by UI steps 7, 8 and Command steps 2, 5, 6
- AC-6: covered by UI step 9 and Command step 1
- AC-7: covered by UI step 8 and Command step 7
- AC-8: covered by UI step 9 and Command steps 7, 8
- AC-9: covered by UI steps 10, 11 and Command step 7
- AC-10: covered by UI steps 12, 13 and Command steps 7, 8
- AC-11: covered by UI steps 14, 15 and Command steps 5, 6
- AC-12: covered by UI step 16 and Command step 6

## Value sourcing coverage

- `cv_ai_key_scrimba` cookie payload: exercised by UI step 2 and Command steps 3, 4, 5
- Video job duration: exercised by UI steps 7, 8 and Command steps 1, 5
- Chapter timestamps and bounds: exercised by UI step 9 and Command step 1
- Active cue index: exercised by UI step 9 and Command steps 1, 7
- Rate limit notice countdown: exercised by UI step 14 and Command step 5
