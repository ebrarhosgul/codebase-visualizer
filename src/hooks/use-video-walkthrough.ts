"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CodebaseGraph } from "@/entities";
import type { AiQueryMessage } from "@/lib/ai/types";
import type {
  CreateVideoJobResponse,
  GetVideoJobStatusResponse,
  VideoWalkthroughJob,
} from "@/lib/ai/video/types";
import {
  createDemoWalkthroughJob,
  isVideoDemoRepository,
} from "@/lib/ai/video/demo-walkthrough";
import { buildValidatedVideoCues } from "@/lib/ai/video/cue-mapper";
import { classifyError } from "@/lib/ai/error-classifier";

export interface UseVideoWalkthroughOptions {
  readonly repositoryFullName?: string | null;
  readonly graph?: CodebaseGraph | null;
  readonly hasVideoKey: boolean;
  readonly onJobUpdate: (messageId: string, job: VideoWalkthroughJob) => void;
  readonly onOpenKeySettings?: (initialProvider?: "scrimba") => void;
}

export function useVideoWalkthrough({
  repositoryFullName,
  graph,
  hasVideoKey,
  onJobUpdate,
  onOpenKeySettings,
}: UseVideoWalkthroughOptions) {
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const prevRepoRef = useRef<string | null | undefined>(repositoryFullName);

  // Abort ongoing job when repository changes (AC-12)
  useEffect(() => {
    if (prevRepoRef.current !== repositoryFullName) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      setActiveJobId(null);
      setIsGenerating(false);
      prevRepoRef.current = repositoryFullName;
    }
  }, [repositoryFullName]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  const cancelWalkthrough = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setActiveJobId(null);
    setIsGenerating(false);
  }, []);

  const pollJobStatus = useCallback(
    async (
      jobId: string,
      messageId: string,
      initialJob: VideoWalkthroughJob,
      signal: AbortSignal,
    ): Promise<void> => {
      const startTime = Date.now();
      const MAX_POLL_TIMEOUT_MS = 120 * 1000;
      let attempt = 0;
      let currentJob = initialJob;

      while (!signal.aborted) {
        if (Date.now() - startTime > MAX_POLL_TIMEOUT_MS) {
          const timeoutNotice = classifyError({
            code: "network_timeout",
            provider: "scrimba",
            suggestedAction: "retry",
            message: "Walkthrough generation timed out after 120 seconds.",
          });
          const failedJob: VideoWalkthroughJob = {
            ...currentJob,
            status: "failed",
            errorNotice: timeoutNotice,
            updatedAt: new Date().toISOString(),
          };
          onJobUpdate(messageId, failedJob);
          setActiveJobId(null);
          setIsGenerating(false);
          return;
        }

        const delayMs = Math.min(
          10000,
          Math.round(4000 * Math.pow(1.5, attempt)),
        );

        await new Promise((resolve) => {
          const timer = setTimeout(resolve, delayMs);
          signal.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              resolve(undefined);
            },
            { once: true },
          );
        });

        if (signal.aborted) return;

        try {
          const pollRes = await fetch(
            `/api/ai/video/${encodeURIComponent(jobId)}`,
            {
              method: "GET",
              signal,
            },
          );

          if (!pollRes.ok) {
            const errData = (await pollRes.json().catch(() => ({}))) as {
              error?: string;
              fallbackNotice?: VideoWalkthroughJob["errorNotice"];
            };
            const errorNotice =
              errData.fallbackNotice ??
              classifyError({
                status: pollRes.status,
                provider: "scrimba",
                message:
                  errData.error || `Polling failed HTTP ${pollRes.status}`,
                suggestedAction: pollRes.status === 401 ? "open_keys" : "retry",
              });

            const failedJob: VideoWalkthroughJob = {
              ...currentJob,
              status: "failed",
              errorNotice,
              updatedAt: new Date().toISOString(),
            };
            onJobUpdate(messageId, failedJob);
            setActiveJobId(null);
            setIsGenerating(false);
            return;
          }

          const pollData = (await pollRes.json()) as GetVideoJobStatusResponse;

          if (pollData.status === "complete" && pollData.videoUri) {
            const validatedCues = graph
              ? buildValidatedVideoCues({
                  durationSeconds: pollData.durationSeconds,
                  upstreamScenes: pollData.upstreamScenes,
                  messageContent: currentJob.cues[0]?.narration || "",
                  graph,
                })
              : currentJob.cues;

            const completedJob: VideoWalkthroughJob = {
              ...currentJob,
              status: "complete",
              videoUri: pollData.videoUri,
              durationSeconds: pollData.durationSeconds,
              cues: validatedCues,
              errorNotice: null,
              updatedAt: new Date().toISOString(),
            };
            onJobUpdate(messageId, completedJob);
            setActiveJobId(null);
            setIsGenerating(false);
            return;
          }

          if (pollData.status === "failed") {
            const failedJob: VideoWalkthroughJob = {
              ...currentJob,
              status: "failed",
              errorNotice:
                pollData.errorNotice ??
                classifyError({
                  status: 500,
                  provider: "scrimba",
                  message: "Walkthrough generation failed upstream.",
                  suggestedAction: "retry",
                }),
              updatedAt: new Date().toISOString(),
            };
            onJobUpdate(messageId, failedJob);
            setActiveJobId(null);
            setIsGenerating(false);
            return;
          }

          // Still queued / polling
          currentJob = {
            ...currentJob,
            status: "polling",
            updatedAt: new Date().toISOString(),
          };
          onJobUpdate(messageId, currentJob);
          attempt++;
        } catch (err: unknown) {
          if (signal.aborted) return;
          const networkNotice = classifyError({
            code: "network_timeout",
            provider: "scrimba",
            suggestedAction: "retry",
            error: err,
          });
          const failedJob: VideoWalkthroughJob = {
            ...currentJob,
            status: "failed",
            errorNotice: networkNotice,
            updatedAt: new Date().toISOString(),
          };
          onJobUpdate(messageId, failedJob);
          setActiveJobId(null);
          setIsGenerating(false);
          return;
        }
      }
    },
    [graph, onJobUpdate],
  );

  const startWalkthrough = useCallback(
    async (message: AiQueryMessage): Promise<void> => {
      if (!graph) return;

      const repoName = repositoryFullName || graph.repository?.fullName || "";

      // Path A: Zero-friction offline demo mode for facebook/react when no key is set (AC-3)
      if (!hasVideoKey && isVideoDemoRepository(repoName)) {
        const demoJob = createDemoWalkthroughJob({
          messageId: message.id,
          repositoryFullName: repoName,
          messageContent: message.content,
          pathTrace: message.pathTrace,
          citations: message.citations,
          graph,
        });
        onJobUpdate(message.id, demoJob);
        return;
      }

      // Path B: Custom repository without video key (AC-3)
      if (!hasVideoKey) {
        const authNotice = classifyError({
          status: 401,
          provider: "scrimba",
          suggestedAction: "open_keys",
          message:
            "A personal Scrimba API key is required to generate video walkthroughs for custom repositories.",
        });

        const initialCues = buildValidatedVideoCues({
          durationSeconds: 30,
          messageContent: message.content,
          pathTrace: message.pathTrace,
          citations: message.citations,
          graph,
        });

        const unauthenticatedJob: VideoWalkthroughJob = {
          jobId: `auth-err-${message.id}-${Date.now()}`,
          messageId: message.id,
          repositoryFullName: repoName,
          status: "failed",
          providerId: "scrimba",
          videoUri: null,
          durationSeconds: 30,
          cues: initialCues,
          errorNotice: authNotice,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        onJobUpdate(message.id, unauthenticatedJob);
        onOpenKeySettings?.("scrimba");
        return;
      }

      // Path C: Live BYOK walkthrough via POST /api/ai/video + polling
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;
      setIsGenerating(true);

      const targetDurationSeconds = Math.min(
        45,
        Math.max(
          15,
          (message.pathTrace?.stepNodeIds.length ||
            message.citations.length ||
            3) * 7,
        ),
      );

      const initialCues = buildValidatedVideoCues({
        durationSeconds: targetDurationSeconds,
        messageContent: message.content,
        pathTrace: message.pathTrace,
        citations: message.citations,
        graph,
      });

      const initialJob: VideoWalkthroughJob = {
        jobId: `pending-${message.id}`,
        messageId: message.id,
        repositoryFullName: repoName,
        status: "queued",
        providerId: "scrimba",
        videoUri: null,
        durationSeconds: targetDurationSeconds,
        cues: initialCues,
        errorNotice: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      onJobUpdate(message.id, initialJob);

      try {
        const res = await fetch("/api/ai/video", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            repositoryFullName: repoName,
            messageId: message.id,
            prompt: `Explain architecture of ${repoName}`,
            answerText: message.content,
            targetDurationSeconds,
            chapters: initialCues.map((c) => ({
              title: c.title,
              narration: c.narration,
              targetNodes: c.nodeIds,
            })),
          }),
        });

        if (!res.ok) {
          const errData = (await res.json().catch(() => ({}))) as {
            error?: string;
            fallbackNotice?: VideoWalkthroughJob["errorNotice"];
          };
          const errorNotice =
            errData.fallbackNotice ??
            classifyError({
              status: res.status,
              provider: "scrimba",
              message:
                errData.error || `Video request failed HTTP ${res.status}`,
              suggestedAction: res.status === 401 ? "open_keys" : "retry",
            });

          const failedJob: VideoWalkthroughJob = {
            ...initialJob,
            status: "failed",
            errorNotice,
            updatedAt: new Date().toISOString(),
          };
          onJobUpdate(message.id, failedJob);
          setIsGenerating(false);
          return;
        }

        const data = (await res.json()) as CreateVideoJobResponse;
        setActiveJobId(data.jobId);

        const activeJob: VideoWalkthroughJob = {
          ...initialJob,
          jobId: data.jobId,
          status: data.status,
          durationSeconds: data.durationSeconds,
          updatedAt: new Date().toISOString(),
        };
        onJobUpdate(message.id, activeJob);

        // Start background polling loop
        await pollJobStatus(
          data.jobId,
          message.id,
          activeJob,
          controller.signal,
        );
      } catch (err: unknown) {
        if (controller.signal.aborted) return;
        const fallbackNotice = classifyError({
          code: "network_timeout",
          provider: "scrimba",
          suggestedAction: "retry",
          error: err,
        });
        const failedJob: VideoWalkthroughJob = {
          ...initialJob,
          status: "failed",
          errorNotice: fallbackNotice,
          updatedAt: new Date().toISOString(),
        };
        onJobUpdate(message.id, failedJob);
        setIsGenerating(false);
      }
    },
    [
      graph,
      repositoryFullName,
      hasVideoKey,
      onJobUpdate,
      onOpenKeySettings,
      pollJobStatus,
    ],
  );

  const refreshVideoUrl = useCallback(
    async (message: AiQueryMessage): Promise<void> => {
      const existingJob = message.videoWalkthrough;
      if (!existingJob?.jobId || existingJob.providerId === "demo") {
        return startWalkthrough(message);
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;
      setIsGenerating(true);

      const pollingJob: VideoWalkthroughJob = {
        ...existingJob,
        status: "polling",
        errorNotice: null,
        updatedAt: new Date().toISOString(),
      };
      onJobUpdate(message.id, pollingJob);

      await pollJobStatus(
        existingJob.jobId,
        message.id,
        pollingJob,
        controller.signal,
      );
    },
    [onJobUpdate, pollJobStatus, startWalkthrough],
  );

  return {
    startWalkthrough,
    cancelWalkthrough,
    refreshVideoUrl,
    activeJobId,
    isGenerating,
  };
}
