"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { useGraphStore } from "@/stores/graph-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useAiQueryStream } from "@/hooks/use-ai-query-stream";
import { buildTopologyContextSummary } from "@/graph/context-summary";
import { KeySettingsDialog } from "./key-settings-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  Send,
  Square,
  Key,
  Trash2,
  FileCode,
  Layers,
  Compass,
  AlertTriangle,
  ArrowRight,
  Copy,
  Check,
} from "lucide-react";
import type {
  AiFallbackNotice,
  AiProviderId,
  AiQueryMessage,
  CitationRef,
} from "@/lib/ai/types";
import type { DemoIntent } from "@/lib/ai/demo/intents";
import type { DemoPromptChip } from "@/lib/ai/demo/types";
import { DEMO_PROMPT_CHIPS } from "@/lib/ai/demo/chips";
import type { PathTrace } from "@/entities";
import { FallbackNoticeCard } from "./fallback-notice-card";
import { MarkdownMessage } from "./markdown-message";
import { PromptChips } from "./prompt-chips";
import { DemoAnswerFooter } from "./demo-answer-footer";

export function TracePanel(): React.JSX.Element {
  const repository = useGraphStore((state) => state.repository);
  const graph = useGraphStore((state) => state.graph);
  const activeTrace = useGraphStore((state) => state.activeTrace);
  const activeStepIndex = useGraphStore((state) => state.activeStepIndex);
  const highlightedNodeIds = useGraphStore((state) => state.highlightedNodeIds);
  const highlightSource = useGraphStore((state) => state.highlightSource);
  const visibleFileIds = useGraphStore((state) => state.visibleFileIds);
  const isCalculatingLayout = useGraphStore(
    (state) => state.isCalculatingLayout,
  );
  const setActiveTrace = useGraphStore((state) => state.setActiveTrace);
  const focusTraceStep = useGraphStore((state) => state.focusTraceStep);
  const clearTrace = useGraphStore((state) => state.clearTrace);
  const setAnswerHighlight = useGraphStore((state) => state.setAnswerHighlight);
  const clearLayerFilters = useGraphStore((state) => state.clearLayerFilters);
  const expandAllFolders = useGraphStore((state) => state.expandAllFolders);
  const setSearchQuery = useGraphStore((state) => state.setSearchQuery);
  const navigateToTarget = useGraphStore((state) => state.navigateToTarget);
  const setActiveRightTab = useWorkspaceStore(
    (state) => state.setActiveRightTab,
  );

  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<AiQueryMessage[]>([]);
  const [isDemoMode, setIsDemoMode] = useState(true);
  const [selectedProvider, setSelectedProvider] =
    useState<AiProviderId>("gemini");
  const [isKeyDialogOpen, setIsKeyDialogOpen] = useState(false);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { isStreaming, streamQuery, abortQuery } = useAiQueryStream();

  // Load thread from sessionStorage bound to repository (AC-1, AC-12)
  const repoKey = repository?.fullName ?? "default";
  const storageKey = `cv:thread:${repoKey}`;

  const prevRepoKeyRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    abortQuery();
    if (typeof window === "undefined") return;

    if (
      prevRepoKeyRef.current !== undefined &&
      prevRepoKeyRef.current !== repoKey
    ) {
      setMessages((prev) => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg && lastMsg.status === "streaming") {
          const finalized =
            lastMsg.content && lastMsg.content.trim().length > 0
              ? { ...lastMsg, status: "complete" as const }
              : null;
          const updated = finalized
            ? [...prev.slice(0, -1), finalized]
            : prev.slice(0, -1);
          try {
            sessionStorage.setItem(
              `cv:thread:${prevRepoKeyRef.current}`,
              JSON.stringify(updated),
            );
          } catch {
            // ignore
          }
        }
        return prev;
      });
    }
    prevRepoKeyRef.current = repoKey;

    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        setMessages(JSON.parse(saved));
      } else {
        setMessages([]);
      }
    } catch {
      setMessages([]);
    }
  }, [storageKey, repoKey, abortQuery]);

  const visibleSet = useMemo(() => new Set(visibleFileIds), [visibleFileIds]);
  const hiddenCount = useMemo(() => {
    if (highlightSource !== "answer") return 0;
    return highlightedNodeIds.filter((id) => !visibleSet.has(id)).length;
  }, [highlightSource, highlightedNodeIds, visibleSet]);

  const handleShowAll = useCallback(() => {
    clearLayerFilters();
    expandAllFolders();
    setSearchQuery("");
  }, [clearLayerFilters, expandAllFolders, setSearchQuery]);
  // Persist messages to sessionStorage when updated (AC-1)
  const saveMessages = (msgs: AiQueryMessage[]) => {
    setMessages(msgs);
    if (typeof window === "undefined") return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(msgs));
    } catch {
      // Tolerate sessionStorage quota errors
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isStreaming]);

  // Check if user has stored API key to initialize demo mode properly
  useEffect(() => {
    fetch("/api/ai/keys")
      .then((res) => res.json())
      .then((data) => {
        if (data.hasKey && data.provider) {
          setIsDemoMode(false);
          setSelectedProvider(data.provider);
        }
      })
      .catch(() => {
        // Silently default to demo mode if check fails
      });
  }, []);

  // Dual action citation navigation (AC-6)
  const handleCitationClick = (citation: CitationRef) => {
    navigateToTarget({
      fileId: citation.fileId,
      symbolId: citation.symbolId ?? undefined,
      line: citation.line ?? undefined,
      source: "search",
      timestamp: Date.now(),
    });
    setActiveRightTab("code");
  };

  const handleCopyMessage = useCallback(async (text: string, msgId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessageId(msgId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch {
      // Tolerate clipboard write failures in restricted environments
    }
  }, []);

  const knownFilePaths = useMemo(() => {
    if (!graph) return [];
    return Object.values(graph.files).map((f) => f.path);
  }, [graph]);

  const handleDirectFileNavigation = useCallback(
    (filePath: string) => {
      if (!graph) return;
      const fileEntry = Object.values(graph.files).find(
        (f) =>
          f.path === filePath ||
          f.path.endsWith(`/${filePath}`) ||
          f.name === filePath,
      );
      if (fileEntry) {
        navigateToTarget({
          fileId: fileEntry.id,
          line: 1,
          source: "search",
          timestamp: Date.now(),
        });
        setActiveRightTab("code");
      }
    },
    [graph, navigateToTarget, setActiveRightTab],
  );

  const executeAssistantQuery = async (
    textToSend: string,
    targetAssistantMsgId?: string,
    demoOverride?: boolean,
    demoIntent?: DemoIntent,
  ) => {
    if (!textToSend || !graph || !repository) {
      return;
    }

    abortQuery();
    clearTrace();
    setWarningMessage(null);

    const activeDemo = demoOverride ?? isDemoMode;
    const assistantMsgId =
      targetAssistantMsgId ?? `msg:${Date.now()}_assistant`;

    let activeMessages: AiQueryMessage[];

    if (!targetAssistantMsgId) {
      const userMsg: AiQueryMessage = {
        id: `msg:${Date.now()}_user`,
        threadId: repoKey,
        role: "user",
        content: textToSend,
        status: "complete",
        citations: Object.freeze([]),
        isPathVerified: true,
        createdAt: new Date().toISOString(),
      };

      const assistantMsg: AiQueryMessage = {
        id: assistantMsgId,
        threadId: repoKey,
        role: "assistant",
        content: "",
        status: "streaming",
        citations: Object.freeze([]),
        isPathVerified: true,
        provenance: activeDemo ? "heuristic" : "model",
        createdAt: new Date().toISOString(),
      };

      activeMessages = [...messages, userMsg, assistantMsg];
      saveMessages(activeMessages);
      setPrompt("");
    } else {
      activeMessages = messages.map((m) =>
        m.id === assistantMsgId
          ? {
              ...m,
              content: "",
              status: "streaming",
              errorMessage: null,
              fallbackNotice: null,
              pathTrace: null,
              citations: Object.freeze([]),
              provenance: activeDemo ? "heuristic" : "model",
            }
          : m,
      );
      saveMessages(activeMessages);
    }

    const contextSummary = buildTopologyContextSummary(graph, textToSend, {
      tokenBudget: activeDemo ? 10000 : 20000,
    });

    let currentText = "";
    let pendingText = "";
    let rafId: number | null = null;

    const flushText = () => {
      if (pendingText !== currentText) {
        currentText = pendingText;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId ? { ...m, content: currentText } : m,
          ),
        );
      }
      rafId = null;
    };

    let receivedTrace: PathTrace | null = null;
    let receivedCitations: readonly CitationRef[] = [];
    let receivedWarning: string | null = null;
    let receivedNotice: AiFallbackNotice | null = null;
    let receivedError: string | null = null;

    const messagesToSend = activeMessages
      .filter((m) => m.id !== assistantMsgId && m.content.trim().length > 0)
      .map((m) => ({
        role: m.role,
        content: m.content,
      }));

    if (messagesToSend.length === 0) {
      messagesToSend.push({ role: "user", content: textToSend });
    }

    await streamQuery({
      repository,
      graph,
      contextSummary,
      messages: messagesToSend,
      isDemo: activeDemo,
      provider: selectedProvider,
      demoIntent: activeDemo ? demoIntent : undefined,
      onTextChunk: (chunk) => {
        pendingText += chunk;
        if (rafId === null && typeof window !== "undefined") {
          rafId = requestAnimationFrame(flushText);
        }
      },
      onTrace: (trace) => {
        receivedTrace = trace;
        setActiveTrace(trace);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId ? { ...m, pathTrace: trace } : m,
          ),
        );
      },
      onCitations: (citations) => {
        receivedCitations = citations;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, citations: Object.freeze(citations) }
              : m,
          ),
        );
      },
      onHighlight: (nodeIds) => {
        if (activeDemo) {
          setAnswerHighlight(nodeIds);
        }
      },
      onWarning: (warning) => {
        receivedWarning = warning;
        setWarningMessage(warning);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, isPathVerified: false, errorMessage: warning }
              : m,
          ),
        );
      },
      onError: (error) => {
        if (rafId !== null && typeof window !== "undefined") {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        flushText();
        receivedError = error;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, status: "error", errorMessage: error }
              : m,
          ),
        );
      },
      onErrorNotice: (notice) => {
        if (rafId !== null && typeof window !== "undefined") {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        flushText();
        receivedNotice = notice;
        receivedError = notice.message;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  status: "error",
                  errorMessage: notice.message,
                  fallbackNotice: notice,
                }
              : m,
          ),
        );
      },
      onComplete: () => {
        if (rafId !== null && typeof window !== "undefined") {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        flushText();
        setMessages((prev) => {
          const finalMessages = prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  status: (receivedError || m.status === "error"
                    ? "error"
                    : "complete") as "error" | "complete",
                  content: currentText || pendingText,
                  errorMessage: receivedError ?? m.errorMessage,
                  fallbackNotice: receivedNotice ?? m.fallbackNotice,
                  pathTrace: receivedTrace,
                  citations: receivedCitations,
                  isPathVerified: !receivedWarning,
                  provenance: activeDemo
                    ? ("heuristic" as const)
                    : ("model" as const),
                }
              : m,
          );
          if (typeof window !== "undefined") {
            try {
              sessionStorage.setItem(storageKey, JSON.stringify(finalMessages));
            } catch {
              // Ignore sessionStorage quota errors
            }
          }
          return finalMessages;
        });
      },
    });
  };

  const handleSend = async (queryText?: string, intentHint?: DemoIntent) => {
    const textToSend = (queryText || prompt).trim();
    if (!textToSend || isStreaming || !graph || !repository) {
      return;
    }
    await executeAssistantQuery(textToSend, undefined, undefined, intentHint);
  };

  const handleSelectChip = (chip: DemoPromptChip) => {
    if (!graph || !repository) return;
    if (isDemoMode) {
      void handleSend(chip.promptText, chip.intent);
    } else {
      void handleSend(chip.promptText);
    }
  };

  const handleSwitchToDemoAndRetry = (assistantMsgId: string) => {
    setIsDemoMode(true);
    const msgIndex = messages.findIndex((m) => m.id === assistantMsgId);
    const prevUserMsg = [...messages.slice(0, msgIndex)]
      .reverse()
      .find((m) => m.role === "user");
    const userText = prevUserMsg?.content || "Explain repository architecture";
    void executeAssistantQuery(userText, assistantMsgId, true);
  };

  const handleRetryMessage = (assistantMsgId: string) => {
    const msgIndex = messages.findIndex((m) => m.id === assistantMsgId);
    const prevUserMsg = [...messages.slice(0, msgIndex)]
      .reverse()
      .find((m) => m.role === "user");
    const userText = prevUserMsg?.content || "Explain repository architecture";
    void executeAssistantQuery(userText, assistantMsgId);
  };

  const handleClearChat = () => {
    abortQuery();
    clearTrace();
    saveMessages([]);
    setWarningMessage(null);
  };

  return (
    <div
      className="flex flex-col h-full w-full bg-[#121417] select-none text-xs overflow-hidden"
      data-testid="trace-panel"
    >
      {/* Top action header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/60 bg-[#121417]">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-zinc-400" />
          <span className="font-semibold text-zinc-100">Semantic Trace</span>
          <Badge
            variant={isDemoMode ? "default" : "accent"}
            className="text-[10px] h-4.5 px-1.5"
            title={
              isDemoMode
                ? "Answers are computed from the loaded dependency graph in your browser. No AI model is involved."
                : undefined
            }
          >
            {isDemoMode ? "Demo Mode" : selectedProvider.toUpperCase()}
          </Badge>
        </div>

        <div className="flex items-center gap-1">
          {(Boolean(activeTrace) || highlightSource === "answer") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearTrace}
              className="h-6 px-1.5 text-[10px] text-zinc-400 hover:text-zinc-200"
              title="Clear active trace or highlight glow on canvas"
            >
              Clear Glow
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsDemoMode((prev) => !prev)}
            className="h-6 px-2 text-[10px] text-zinc-400 hover:text-zinc-200"
            title="Toggle between Zero Cost Demo and Live BYOK"
          >
            {isDemoMode ? "Enable BYOK" : "Switch to Demo"}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsKeyDialogOpen(true)}
            className="h-6 w-6 p-0 text-zinc-400 hover:text-zinc-200"
            title="Configure API Keys"
          >
            <Key className="w-3.5 h-3.5" />
          </Button>

          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearChat}
              className="h-6 w-6 p-0 text-zinc-500 hover:text-red-400"
              title="Clear thread history"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Warning banner (AC-4, AC-7) */}
      {warningMessage && (
        <div
          className="mx-3 mt-2 p-2 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-200 text-[11px] flex items-start gap-2"
          data-testid="trace-warning-banner"
        >
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
          <div className="flex-1">{warningMessage}</div>
        </div>
      )}

      {/* Message history container */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-4">
        {messages.length === 0 ? (
          <div className="py-6 text-center space-y-3">
            <div className="w-10 h-10 mx-auto rounded-full bg-zinc-900 border border-zinc-800/80 flex items-center justify-center text-zinc-400">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <div className="font-medium text-zinc-100">
                Ask Architectural Questions
              </div>
              <p className="text-[11px] text-zinc-400 max-w-xs mx-auto mt-1">
                Explore module dependencies and visual call paths in natural
                language.
              </p>
            </div>

            {/* Suggested prompt chips (AC-1, AC-11) */}
            <PromptChips
              chips={DEMO_PROMPT_CHIPS}
              variant="empty"
              disabled={!graph}
              onSelect={handleSelectChip}
            />
          </div>
        ) : (
          messages.map((msg, msgIdx) => (
            <div
              key={msg.id}
              className={`flex flex-col space-y-2 ${
                msg.role === "user" ? "items-end" : "items-start"
              }`}
            >
              <div
                className={`max-w-[90%] rounded-lg p-3 text-xs ${
                  msg.role === "user"
                    ? "bg-zinc-800 text-zinc-100 border border-zinc-700/60 rounded-br-none"
                    : "bg-[#15171B] border border-zinc-800/80 text-zinc-200 rounded-bl-none shadow-xs"
                }`}
              >
                {/* Message body */}
                {msg.role === "user" ? (
                  <div className="whitespace-pre-wrap leading-relaxed">
                    {msg.content}
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-zinc-800/60 text-[10px] text-zinc-500">
                      <div className="flex items-center gap-1.5 font-medium text-zinc-300">
                        <Sparkles className="w-3 h-3 text-zinc-400" />
                        <span>Semantic Assistant</span>
                      </div>
                      {msg.content && msg.status !== "streaming" && (
                        <button
                          type="button"
                          onClick={() => handleCopyMessage(msg.content, msg.id)}
                          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors cursor-pointer"
                          title="Copy response"
                          aria-label={
                            copiedMessageId === msg.id
                              ? "Response copied"
                              : "Copy response"
                          }
                        >
                          {copiedMessageId === msg.id ? (
                            <>
                              <Check className="w-2.5 h-2.5 text-emerald-400" />
                              <span className="text-emerald-400">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-2.5 h-2.5" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    <MarkdownMessage
                      content={msg.content}
                      isStreaming={msg.status === "streaming"}
                      knownFilePaths={knownFilePaths}
                      onFileClick={handleDirectFileNavigation}
                    />
                  </div>
                )}

                {/* Fallback Notice Card (AC-2, AC-3) */}
                {msg.status === "error" && (
                  <FallbackNoticeCard
                    notice={
                      msg.fallbackNotice ?? {
                        code: "unknown",
                        title: "AI Service Notice",
                        message:
                          msg.errorMessage ||
                          "An unexpected error occurred while processing the AI query.",
                        suggestedAction: "retry",
                      }
                    }
                    onSwitchToDemo={() => handleSwitchToDemoAndRetry(msg.id)}
                    onOpenKeySettings={() => setIsKeyDialogOpen(true)}
                    onRetry={() => handleRetryMessage(msg.id)}
                    isRetrying={isStreaming}
                  />
                )}

                {/* Path Trace summary card (AC-5) */}
                {msg.pathTrace && (
                  <div
                    className="mt-3 p-2.5 rounded-md bg-[#0B0C0E] border border-zinc-800/60 space-y-2"
                    data-testid="path-trace-card"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-200">
                        <Layers className="w-3.5 h-3.5 text-zinc-400" />
                        <span>Verified Dependency Path</span>
                      </div>
                      <Badge
                        variant="default"
                        className="text-[10px] h-4 px-1.5"
                      >
                        {msg.pathTrace.hopCount} hop
                        {msg.pathTrace.hopCount === 1 ? "" : "s"}
                      </Badge>
                    </div>

                    {/* Step pills */}
                    <div className="flex flex-wrap items-center gap-1 pt-1">
                      {msg.pathTrace.stepNodeIds.map((nodeId, idx) => {
                        const fileEntity = graph?.files[nodeId];
                        const label = fileEntity?.name ?? nodeId;
                        const isFocused = activeStepIndex === idx;

                        return (
                          <React.Fragment key={nodeId}>
                            <button
                              type="button"
                              onClick={() => {
                                if (activeTrace?.id !== msg.pathTrace?.id) {
                                  setActiveTrace(msg.pathTrace!);
                                }
                                focusTraceStep(idx);
                              }}
                              className={`px-1.5 py-0.5 rounded text-[10px] transition-colors border ${
                                isFocused
                                  ? "bg-blue-600 text-white border-blue-600"
                                  : "bg-zinc-900 text-zinc-300 border-zinc-800 hover:text-zinc-100 hover:border-zinc-700"
                              }`}
                              title={`Step ${idx + 1}: ${fileEntity?.path ?? nodeId}`}
                            >
                              {label}
                            </button>
                            {idx < msg.pathTrace!.stepNodeIds.length - 1 && (
                              <ArrowRight className="w-2.5 h-2.5 text-zinc-600 shrink-0" />
                            )}
                          </React.Fragment>
                        );
                      })}
                    </div>

                    <div className="flex justify-end pt-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setActiveTrace(msg.pathTrace!)}
                        className="h-5 px-2 text-[10px] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
                      >
                        Highlight On Canvas
                      </Button>
                    </div>
                  </div>
                )}

                {/* Citations section (AC-6) */}
                {msg.citations && msg.citations.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-zinc-800/60 space-y-1.5">
                    <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                      Code Citations
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {msg.citations.map((cite) => (
                        <button
                          key={cite.id}
                          onClick={() => handleCitationClick(cite)}
                          className="flex items-center gap-1 px-2 py-1 rounded bg-[#0B0C0E] border border-zinc-800/80 text-[11px] text-zinc-300 hover:text-zinc-100 hover:border-zinc-700 hover:bg-zinc-800/50 transition-colors"
                          title={`Click to view ${cite.label} at line ${cite.line || 1}`}
                        >
                          <FileCode className="w-3 h-3 text-zinc-400" />
                          <span>
                            {cite.label}
                            {cite.line ? `:${cite.line}` : ""}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Heuristic demo footer (AC-7, AC-8) */}
                {msg.role === "assistant" && msg.provenance === "heuristic" && (
                  <DemoAnswerFooter
                    hiddenCount={hiddenCount}
                    isMostRecentAnswer={
                      msgIdx === messages.length - 1 ||
                      (msgIdx === messages.length - 2 &&
                        messages[messages.length - 1].role === "user")
                    }
                    isCalculatingLayout={isCalculatingLayout}
                    onShowAll={handleShowAll}
                    onAddKey={() => setIsKeyDialogOpen(true)}
                  />
                )}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Compact prompt chips when thread has messages (AC-11) */}
      {messages.length > 0 && (
        <PromptChips
          chips={DEMO_PROMPT_CHIPS}
          variant="compact"
          disabled={!graph || isStreaming}
          onSelect={handleSelectChip}
        />
      )}

      {/* Query input footer */}
      <div className="p-3 border-t border-zinc-800/60 bg-[#121417]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-end gap-2"
        >
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={
              !graph
                ? "Load a repository to ask questions..."
                : "Ask about architecture or trace paths..."
            }
            disabled={!graph || isStreaming}
            rows={2}
            className="flex-1 p-2 rounded-md bg-[#0B0C0E] border border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 resize-none disabled:opacity-50 transition-all"
          />

          {isStreaming ? (
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={abortQuery}
              className="h-14 px-3 shrink-0 gap-1"
              title="Stop response"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Stop</span>
            </Button>
          ) : (
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={!graph || !prompt.trim()}
              className="h-14 px-3 shrink-0 gap-1"
              title="Send query (Enter)"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Ask</span>
            </Button>
          )}
        </form>
      </div>

      {/* BYOK Key Settings Dialog */}
      <KeySettingsDialog
        open={isKeyDialogOpen}
        onOpenChange={setIsKeyDialogOpen}
        onKeySaved={(provider) => {
          setSelectedProvider(provider);
          setIsDemoMode(false);
        }}
        onKeyCleared={() => {
          setIsDemoMode(true);
        }}
      />
    </div>
  );
}
