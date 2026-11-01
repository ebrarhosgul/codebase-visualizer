import type { CodebaseGraph, PathTrace } from "@/entities";
import type { CitationRef } from "@/lib/ai/types";
import type { VideoWalkthroughJob } from "./types";
import { buildValidatedVideoCues } from "./cue-mapper";

/**
 * Base64-encoded minimal WebM video container for offline demo walkthrough playback.
 */
export const DEMO_WALKTHROUGH_VIDEO_BASE64 =
  "GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAA14EBq8IEBL+BAkKFgQIYYU4BnBQAAAAAAAAC3gQFn4ECQoWBAhhTgZ+BAgAAAAAAAAAHgQFn4ECAAg==";

/**
 * Checks whether the target repository is the zero-friction demo repository (facebook/react).
 */
export function isVideoDemoRepository(fullName?: string | null): boolean {
  if (!fullName) return false;
  return fullName.trim().toLowerCase() === "facebook/react";
}

/**
 * Creates an in-memory Blob URL for local offline demo playback.
 */
export function createDemoWalkthroughBlobUrl(): string {
  if (typeof window === "undefined" || typeof Blob === "undefined") {
    return `data:video/webm;base64,${DEMO_WALKTHROUGH_VIDEO_BASE64}`;
  }

  try {
    const binary = atob(DEMO_WALKTHROUGH_VIDEO_BASE64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: "video/webm" });
    if (
      typeof URL !== "undefined" &&
      typeof URL.createObjectURL === "function"
    ) {
      return URL.createObjectURL(blob);
    }
    return `data:video/webm;base64,${DEMO_WALKTHROUGH_VIDEO_BASE64}`;
  } catch {
    return `data:video/webm;base64,${DEMO_WALKTHROUGH_VIDEO_BASE64}`;
  }
}

export interface CreateDemoWalkthroughJobInput {
  readonly messageId: string;
  readonly repositoryFullName: string;
  readonly messageContent: string;
  readonly pathTrace?: PathTrace | null;
  readonly citations?: readonly CitationRef[];
  readonly graph: CodebaseGraph;
}

/**
 * Creates a pre-baked demo VideoWalkthroughJob resolving synchronously in the browser.
 */
export function createDemoWalkthroughJob(
  input: CreateDemoWalkthroughJobInput,
): VideoWalkthroughJob {
  const durationSeconds = 30;
  const cues = buildValidatedVideoCues({
    durationSeconds,
    messageContent: input.messageContent,
    pathTrace: input.pathTrace,
    citations: input.citations,
    graph: input.graph,
  });

  const now = new Date().toISOString();

  return {
    jobId: `demo-job-${input.messageId}-${Date.now()}`,
    messageId: input.messageId,
    repositoryFullName: input.repositoryFullName,
    status: "complete",
    providerId: "demo",
    videoUri: createDemoWalkthroughBlobUrl(),
    durationSeconds,
    cues,
    errorNotice: null,
    createdAt: now,
    updatedAt: now,
  };
}
