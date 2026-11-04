"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  RefreshCw,
  Video,
  Eye,
  AlertTriangle,
  Compass,
} from "lucide-react";
import type {
  VideoTimelineCue,
  VideoWalkthroughJob,
} from "@/lib/ai/video/types";
import { findActiveCueIndex } from "@/lib/ai/video/cue-mapper";
import { useGraphStore } from "@/stores/graph-store";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FallbackNoticeCard } from "@/components/trace/fallback-notice-card";

export interface VideoWalkthroughPlayerProps {
  readonly job: VideoWalkthroughJob;
  readonly hiddenCueNodeCount?: number;
  readonly onShowAllNodes?: () => void;
  readonly onOpenKeys?: () => void;
  readonly onRetry?: () => void;
  readonly onRefreshUrl?: () => void;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

export function VideoWalkthroughPlayer({
  job,
  hiddenCueNodeCount,
  onShowAllNodes,
  onOpenKeys,
  onRetry,
  onRefreshUrl,
}: VideoWalkthroughPlayerProps): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [activeCueIndex, setActiveCueIndex] = useState(0);
  const [hasMediaError, setHasMediaError] = useState(false);
  const [elapsedPollingSeconds, setElapsedPollingSeconds] = useState(0);

  const activeCueIndexRef = useRef(0);
  activeCueIndexRef.current = activeCueIndex;

  const {
    highlightSource,
    isVideoAutoPanEnabled,
    setVideoCueHighlight,
    setVideoAutoPan,
    graph,
    visibleFileIds,
    isCalculatingLayout,
  } = useGraphStore(
    useShallow((state) => ({
      highlightSource: state.highlightSource,
      isVideoAutoPanEnabled: state.isVideoAutoPanEnabled,
      setVideoCueHighlight: state.setVideoCueHighlight,
      setVideoAutoPan: state.setVideoAutoPan,
      graph: state.graph,
      visibleFileIds: state.visibleFileIds,
      isCalculatingLayout: state.isCalculatingLayout,
    })),
  );

  // Dynamic hidden cue node count tracking active chapter (AC-10)
  const effectiveHiddenCueNodeCount = React.useMemo(() => {
    if (hiddenCueNodeCount !== undefined) {
      return hiddenCueNodeCount;
    }
    if (
      highlightSource !== "video" ||
      isCalculatingLayout ||
      !visibleFileIds ||
      visibleFileIds.length === 0
    ) {
      return 0;
    }
    const currentCue = job.cues[activeCueIndex];
    if (!currentCue) return 0;
    const visibleSet = new Set(visibleFileIds);
    let hidden = 0;
    for (const id of currentCue.nodeIds) {
      const fileId = graph?.symbols[id]?.fileId ?? id;
      if (!visibleSet.has(fileId)) {
        hidden++;
      }
    }
    return hidden;
  }, [
    hiddenCueNodeCount,
    highlightSource,
    isCalculatingLayout,
    visibleFileIds,
    job.cues,
    activeCueIndex,
    graph,
  ]);

  // Poll timer display while queued or polling
  useEffect(() => {
    if (job.status === "queued" || job.status === "polling") {
      const timer = setInterval(() => {
        setElapsedPollingSeconds((prev) => prev + 1);
      }, 1000);
      return () => clearInterval(timer);
    }
    setElapsedPollingSeconds(0);
  }, [job.status]);

  // Sync canvas highlights on discrete cue changes (AC-8)
  const applyCueHighlight = useCallback(
    (cue: VideoTimelineCue) => {
      setVideoCueHighlight({
        nodeIds: cue.nodeIds,
        edgeIds: cue.edgeIds,
        focalNodeId: cue.focalNodeId,
      });
    },
    [setVideoCueHighlight],
  );

  const handleCueTransition = useCallback(
    (newIndex: number) => {
      if (newIndex === activeCueIndexRef.current) return;
      setActiveCueIndex(newIndex);
      const cue = job.cues[newIndex];
      if (cue) {
        applyCueHighlight(cue);
      }
    },
    [job.cues, applyCueHighlight],
  );

  const handleTimeUpdate = useCallback(() => {
    if (!videoRef.current) return;
    const time = videoRef.current.currentTime;
    setCurrentTime(time);

    const nextCueIndex = findActiveCueIndex(job.cues, time);
    if (nextCueIndex !== null && nextCueIndex !== activeCueIndexRef.current) {
      handleCueTransition(nextCueIndex);
    }
  }, [job.cues, handleCueTransition]);

  const togglePlayPause = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().catch(() => {
        // Handle browser playback policy gracefully
      });
      setIsPlaying(true);
      // Ensure canvas highlight is initialized to active cue
      const activeCue = job.cues[activeCueIndexRef.current];
      if (activeCue) {
        applyCueHighlight(activeCue);
      }
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  }, [job.cues, applyCueHighlight]);

  const handleSeek = useCallback(
    (targetSeconds: number) => {
      if (videoRef.current) {
        videoRef.current.currentTime = Math.max(
          0,
          Math.min(targetSeconds, job.durationSeconds),
        );
      }
      setCurrentTime(targetSeconds);
      const nextCueIndex = findActiveCueIndex(job.cues, targetSeconds);
      if (nextCueIndex !== null) {
        handleCueTransition(nextCueIndex);
      }
    },
    [job.durationSeconds, job.cues, handleCueTransition],
  );

  const handleChapterClick = useCallback(
    (cue: VideoTimelineCue) => {
      handleSeek(cue.startTimeSeconds);
      applyCueHighlight(cue);
    },
    [handleSeek, applyCueHighlight],
  );

  const handleResumeSync = useCallback(() => {
    setVideoAutoPan(true);
    const activeCue = job.cues[activeCueIndex];
    if (activeCue) {
      applyCueHighlight(activeCue);
    }
  }, [setVideoAutoPan, job.cues, activeCueIndex, applyCueHighlight]);

  // Loading / Polling state
  if (job.status === "queued" || job.status === "polling") {
    return (
      <div
        className="mt-3 p-3 rounded-lg border border-border-default bg-surface-canvas space-y-3"
        data-testid="video-walkthrough-loading"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-accent-text animate-spin" />
            <span className="text-xs font-semibold text-text-primary">
              Generating Video Walkthrough...
            </span>
          </div>
          <Badge variant="accent" className="text-[10px] h-4.5 px-2 font-mono">
            {elapsedPollingSeconds}s elapsed
          </Badge>
        </div>

        <p className="text-xs text-text-secondary leading-relaxed">
          Rendering architectural explainer video scenes and synchronizing
          dependency graph milestones...
        </p>

        {job.cues.length > 0 && (
          <div className="space-y-1.5 pt-1 border-t border-border-subtle">
            <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
              Planned Chapters ({job.cues.length})
            </span>
            <div className="flex flex-wrap gap-1.5">
              {job.cues.map((cue, idx) => (
                <div
                  key={cue.cueId}
                  className="px-2 py-0.5 rounded-sm bg-surface-panel-secondary border border-border-subtle text-[10px] text-text-secondary"
                >
                  {idx + 1}. {cue.title}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Failed state with recovery notice
  if (job.status === "failed") {
    return (
      <div className="mt-3 space-y-2" data-testid="video-walkthrough-failed">
        <FallbackNoticeCard
          notice={
            job.errorNotice ?? {
              code: "unknown",
              title: "Walkthrough Generation Notice",
              message: "Unable to generate the video walkthrough at this time.",
              suggestedAction: "retry",
            }
          }
          onOpenKeySettings={onOpenKeys}
          onRetry={onRetry}
        />
        {/* Even on error, allow stepping through generated chapter highlights */}
        {job.cues.length > 0 && (
          <div className="p-2.5 rounded-md border border-border-subtle bg-surface-canvas space-y-2">
            <div className="text-[11px] font-medium text-text-primary flex items-center justify-between">
              <span>Interactive Chapter Fallback</span>
              <span className="text-[10px] text-text-muted">
                Step through nodes without video
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {job.cues.map((cue, idx) => {
                const isActive = activeCueIndex === idx;
                return (
                  <button
                    type="button"
                    key={cue.cueId}
                    onClick={() => handleChapterClick(cue)}
                    className={`px-2 py-1 rounded-sm text-xs border transition-colors cursor-pointer ${
                      isActive
                        ? "bg-accent-primary text-white border-accent-primary font-medium"
                        : "bg-surface-panel border-border-default text-text-secondary hover:text-text-primary hover:border-border-strong"
                    }`}
                  >
                    {idx + 1}. {cue.title}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  const activeCue = job.cues[activeCueIndex] ?? job.cues[0];

  return (
    <div
      className="mt-3 rounded-lg border border-border-default bg-surface-card overflow-hidden shadow-sm"
      data-testid="video-walkthrough-player"
    >
      {/* Video Container (HTML5 native, initialized paused at 0:00) */}
      <div className="relative bg-black aspect-video flex items-center justify-center">
        {job.videoUri && !hasMediaError ? (
          <video
            ref={videoRef}
            src={job.videoUri}
            preload="metadata"
            playsInline
            onTimeUpdate={handleTimeUpdate}
            onSeeked={handleTimeUpdate}
            onEnded={() => setIsPlaying(false)}
            onError={() => setHasMediaError(true)}
            className="w-full h-full object-contain"
            data-testid="walkthrough-video-element"
          />
        ) : (
          <div className="p-4 text-center space-y-2">
            <AlertTriangle className="w-8 h-8 text-status-warning mx-auto" />
            <p className="text-xs text-text-secondary">
              Video media could not be loaded or URL has expired.
            </p>
            <div className="flex items-center justify-center gap-2 pt-1">
              {onRefreshUrl && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={onRefreshUrl}
                  className="h-6 text-xs gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Refresh Video</span>
                </Button>
              )}
              {onRetry && (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={onRetry}
                  className="h-6 text-xs"
                >
                  Regenerate
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Video Overlay Badge */}
        <div className="absolute top-2 left-2 flex items-center gap-1.5 pointer-events-none">
          <Badge
            variant="default"
            className="bg-black/70 backdrop-blur-xs text-[10px] text-white border-white/20 h-5 px-1.5"
          >
            <Video className="w-3 h-3 mr-1 text-accent-text" />
            <span>
              {job.providerId === "demo" ? "Sample Demo" : "Scrimba Explainer"}
            </span>
          </Badge>
        </div>
      </div>

      {/* Control Bar and Timeline Scrubber */}
      <div className="p-3 bg-surface-panel space-y-2.5">
        {/* Scrubber with Chapter Cue Markers */}
        <div className="space-y-1">
          <div
            className="relative h-2 rounded-full bg-surface-canvas border border-border-default cursor-pointer overflow-hidden"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = Math.max(
                0,
                Math.min(1, (e.clientX - rect.left) / rect.width),
              );
              handleSeek(ratio * job.durationSeconds);
            }}
            data-testid="timeline-scrubber"
          >
            {/* Progress Fill */}
            <div
              className="absolute left-0 top-0 bottom-0 bg-accent-primary transition-all duration-75"
              style={{
                width: `${Math.min(100, (currentTime / (job.durationSeconds || 1)) * 100)}%`,
              }}
            />

            {/* Cue Dividers */}
            {job.cues.map((c, i) => {
              if (i === 0) return null;
              const leftPercent =
                (c.startTimeSeconds / (job.durationSeconds || 1)) * 100;
              return (
                <div
                  key={c.cueId}
                  className="absolute top-0 bottom-0 w-0.5 bg-white/40 z-10"
                  style={{ left: `${leftPercent}%` }}
                  title={`${c.title} (${formatTime(c.startTimeSeconds)})`}
                />
              );
            })}
          </div>

          <div className="flex items-center justify-between text-[11px] font-mono text-text-muted">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(job.durationSeconds)}</span>
          </div>
        </div>

        {/* Playback Controls & Auto Pan Toggle */}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-border-subtle">
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              onClick={togglePlayPause}
              aria-label={
                isPlaying ? "Pause video walkthrough" : "Play video walkthrough"
              }
              data-testid="play-pause-btn"
              className="h-7 px-2.5 text-xs gap-1.5"
            >
              {isPlaying ? (
                <>
                  <Pause className="w-3.5 h-3.5 fill-current" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Play</span>
                </>
              )}
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleSeek(0)}
              aria-label="Restart video"
              data-testid="restart-video-btn"
              className="h-7 px-2 text-text-secondary hover:text-text-primary"
              title="Restart from beginning"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </Button>
          </div>

          {/* Canvas Auto Pan Control & Resume Sync Action (AC-8, AC-9) */}
          <div className="flex items-center gap-2">
            {!isVideoAutoPanEnabled && highlightSource === "video" && (
              <Button
                size="sm"
                variant="primary"
                onClick={handleResumeSync}
                data-testid="resume-sync-btn"
                className="h-6 px-2 text-[11px] gap-1 animate-pulse"
                title="Canvas camera sync was paused by manual pan/zoom. Click to resume."
              >
                <Compass className="w-3 h-3" />
                <span>Resume sync</span>
              </Button>
            )}

            <button
              type="button"
              onClick={() => setVideoAutoPan(!isVideoAutoPanEnabled)}
              data-testid="auto-pan-toggle"
              className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors cursor-pointer border ${
                isVideoAutoPanEnabled
                  ? "bg-surface-active text-text-primary border-border-strong font-medium"
                  : "bg-surface-panel-secondary text-text-muted border-border-default hover:text-text-secondary"
              }`}
              title="Toggle automatic camera centering on active video nodes"
            >
              <Compass className="w-3.5 h-3.5 text-accent-text" />
              <span>Auto pan</span>
            </button>
          </div>
        </div>

        {/* Active Chapter Caption */}
        {activeCue && (
          <div
            className="p-2.5 rounded-md bg-surface-canvas border border-border-subtle space-y-1"
            data-testid="active-cue-caption"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-text-primary">
                {activeCue.index + 1}. {activeCue.title}
              </span>
              <span className="text-[10px] font-mono text-text-muted">
                {formatTime(activeCue.startTimeSeconds)} -{" "}
                {formatTime(activeCue.endTimeSeconds)}
              </span>
            </div>
            <p className="text-xs text-text-secondary leading-normal">
              {activeCue.narration}
            </p>
          </div>
        )}

        {/* Chapter List Buttons */}
        <div className="space-y-1 pt-1">
          <div className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
            Chapters ({job.cues.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {job.cues.map((cue, idx) => {
              const isActive = activeCueIndex === idx;
              return (
                <button
                  type="button"
                  key={cue.cueId}
                  data-testid={`chapter-cue-${idx}`}
                  onClick={() => handleChapterClick(cue)}
                  className={`px-2 py-1 rounded-sm text-xs border transition-colors cursor-pointer ${
                    isActive
                      ? "bg-accent-primary text-white border-accent-primary font-medium"
                      : "bg-surface-panel border-border-default text-text-secondary hover:text-text-primary hover:border-border-strong"
                  }`}
                >
                  {idx + 1}. {cue.title}
                </button>
              );
            })}
          </div>
        </div>

        {/* Hidden Nodes Filter Notice (AC-10) */}
        {effectiveHiddenCueNodeCount > 0 && (
          <div
            className="flex items-center justify-between p-2 rounded bg-status-warning/10 border border-status-warning/20 text-xs text-status-warning"
            data-testid="hidden-cue-nodes-banner"
          >
            <div className="flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 shrink-0" />
              <span>
                {effectiveHiddenCueNodeCount} cue node
                {effectiveHiddenCueNodeCount === 1 ? "" : "s"} hidden by current
                filters
              </span>
            </div>
            {onShowAllNodes && (
              <Button
                size="sm"
                variant="ghost"
                onClick={onShowAllNodes}
                data-testid="show-all-cue-nodes-btn"
                className="h-5 px-2 text-[11px] text-status-warning hover:bg-status-warning/20 hover:text-status-warning"
              >
                Show all
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
