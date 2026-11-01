import type { AiFallbackNotice } from "@/lib/ai/types";

export type VideoProviderId = "scrimba" | "demo";

export type VideoJobStatus = "queued" | "polling" | "complete" | "failed";

export interface ScrimbaUpstreamScene {
  readonly title?: string;
  readonly narration?: string;
  readonly startTimeSeconds?: number;
  readonly endTimeSeconds?: number;
  readonly targetNodeIds?: readonly string[];
}

export interface ScrimbaCreateExplainerRequest {
  readonly title: string;
  readonly prompt: string;
  readonly context: string;
  readonly targetDurationSeconds: number;
  readonly chapters: readonly {
    readonly title: string;
    readonly narration: string;
    readonly targetNodes: readonly string[];
  }[];
}

export interface ScrimbaExplainerStatusResponse {
  readonly id: string;
  readonly status: "queued" | "processing" | "complete" | "failed";
  readonly durationSeconds?: number;
  readonly videoUrl?: string | null;
  readonly scenes?: readonly ScrimbaUpstreamScene[];
  readonly error?: string | null;
}

export interface VideoTimelineCue {
  readonly cueId: string;
  readonly index: number;
  readonly startTimeSeconds: number;
  readonly endTimeSeconds: number;
  readonly title: string;
  readonly narration: string;
  readonly nodeIds: readonly string[];
  readonly edgeIds: readonly string[];
  readonly focalNodeId: string | null;
}

export interface VideoWalkthroughJob {
  readonly jobId: string;
  readonly messageId: string;
  readonly repositoryFullName: string;
  readonly status: VideoJobStatus;
  readonly providerId: VideoProviderId;
  readonly videoUri: string | null;
  readonly durationSeconds: number;
  readonly cues: readonly VideoTimelineCue[];
  readonly errorNotice: AiFallbackNotice | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateVideoJobRequest {
  readonly repositoryFullName: string;
  readonly messageId: string;
  readonly prompt: string;
  readonly answerText: string;
  readonly targetDurationSeconds?: number;
  readonly chapters?: readonly {
    readonly title: string;
    readonly narration: string;
    readonly targetNodes: readonly string[];
  }[];
}

export interface CreateVideoJobResponse {
  readonly jobId: string;
  readonly status: "queued" | "polling";
  readonly durationSeconds: number;
  readonly upstreamScenes?: readonly ScrimbaUpstreamScene[];
}

export interface GetVideoJobStatusResponse {
  readonly jobId: string;
  readonly status: VideoJobStatus;
  readonly videoUri: string | null;
  readonly durationSeconds: number;
  readonly upstreamScenes?: readonly ScrimbaUpstreamScene[];
  readonly errorNotice?: AiFallbackNotice | null;
}
