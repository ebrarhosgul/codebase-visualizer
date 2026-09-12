"use client";

import React, { useState, useEffect, useRef } from "react";
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
} from "lucide-react";
import type {
  AiFallbackNotice,
  AiProviderId,
  AiQueryMessage,
  CitationRef,
} from "@/lib/ai/types";
import type { PathTrace } from "@/entities";
import { FallbackNoticeCard } from "./fallback-notice-card";

const SUGGESTED_PROMPTS = [
  "How do stores connect to canvas?",
  "Trace path between entrypoint and services",
  "What is the architectural layer structure?",
  "How does ingestion data flow into the graph?",
];

export function TracePanel(): React.JSX.Element {
  const repository = useGraphStore((state) => state.repository);
  const graph = useGraphStore((state) => state.graph);
  const activeTrace = useGraphStore((state) => state.activeTrace);
  const activeStepIndex = useGraphStore((state) => state.activeStepIndex);
  const setActiveTrace = useGraphStore((state) => state.setActiveTrace);
  const focusTraceStep = useGraphStore((state) => state.focusTraceStep);
  const clearTrace = useGraphStore((state) => state.clearTrace);
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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { isStreaming, streamQuery, abortQuery } = useAiQueryStream();

  // Load thread from sessionStorage bound to repository (AC-1)
  const repoKey = repository?.fullName ?? "default";
  const storageKey = `cv:thread:${repoKey}`;

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as AiQueryMessage[];
        setMessages(parsed);
      } else {
        setMessages([]);
      }
    } catch {
      setMessages([]);
    }
  }, [storageKey]);

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

  const executeAssistantQuery = async (
    textToSend: string,
    targetAssistantMsgId?: string,
    demoOverride?: boolean,
  ) => {
    if (!textToSend || !graph || !repository) {
      return;
    }

    abortQuery();
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
            }
          : m,
      );
      saveMessages(activeMessages);
    }

    const contextSummary = buildTopologyContextSummary(graph, textToSend, {
      tokenBudget: activeDemo ? 10000 : 20000,
    });

    let currentText = "";
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
      onTextChunk: (chunk) => {
        currentText += chunk;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId ? { ...m, content: currentText } : m,
          ),
        );
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
        setMessages((prev) => {
          const finalMessages = prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  status: (receivedError || m.status === "error"
                    ? "error"
                    : "complete") as "error" | "complete",
                  content: currentText,
                  errorMessage: receivedError ?? m.errorMessage,
                  fallbackNotice: receivedNotice ?? m.fallbackNotice,
                  pathTrace: receivedTrace,
                  citations: receivedCitations,
                  isPathVerified: !receivedWarning,
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

  const handleSend = async (queryText?: string) => {
    const textToSend = (queryText || prompt).trim();
    if (!textToSend || isStreaming || !graph || !repository) {
      return;
    }
    await executeAssistantQuery(textToSend);
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
    saveMessages([]);
    clearTrace();
    setWarningMessage(null);
  };

  return (
    <div
      className="flex flex-col h-full w-full bg-[var(--surface-panel)] select-none text-xs overflow-hidden"
      data-testid="trace-panel"
    >
      {/* Top action header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-subtle)] bg-[var(--surface-card)]">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
          <span className="font-semibold text-[var(--text-primary)]">
            Semantic Trace
          </span>
          <Badge
            variant={isDemoMode ? "default" : "accent"}
            className="text-[10px] h-4.5 px-1.5"
          >
            {isDemoMode ? "Demo Mode" : selectedProvider.toUpperCase()}
          </Badge>
        </div>

        <div className="flex items-center gap-1">
          {activeTrace && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearTrace}
              className="h-6 px-1.5 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              title="Clear active trace glow on canvas"
            >
              Clear Glow
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsDemoMode((prev) => !prev)}
            className="h-6 px-2 text-[10px]"
            title="Toggle between Zero Cost Demo and Live BYOK"
          >
            {isDemoMode ? "Enable BYOK" : "Switch to Demo"}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsKeyDialogOpen(true)}
            className="h-6 w-6 p-0 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            title="Configure API Keys"
          >
            <Key className="w-3.5 h-3.5" />
          </Button>

          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearChat}
              className="h-6 w-6 p-0 text-[var(--text-muted)] hover:text-[var(--status-error)]"
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
          className="mx-3 mt-2 p-2 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-200 text-[11px] flex items-start gap-2"
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
            <div className="w-10 h-10 mx-auto rounded-full bg-[var(--surface-hover)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--accent-primary)]">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <div className="font-medium text-[var(--text-primary)]">
                Ask Architectural Questions
              </div>
              <p className="text-[11px] text-[var(--text-muted)] max-w-xs mx-auto mt-1">
                Explore module dependencies and visual call paths in natural
                language.
              </p>
            </div>

            {/* Suggested prompt pills (AC-2) */}
            <div className="pt-2 space-y-1.5 max-w-xs mx-auto text-left">
              <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                Suggested Prompts
              </div>
              <div className="flex flex-col gap-1.5">
                {SUGGESTED_PROMPTS.map((promptText, i) => (
                  <button
                    type="button"
                    key={i}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleSend(promptText);
                    }}
                    disabled={!graph}
                    className={`w-full text-left p-2 rounded-md bg-[var(--surface-panel-secondary)] border border-[var(--border-subtle)] text-[var(--text-secondary)] text-[11px] transition-colors ${
                      !graph
                        ? "opacity-50 cursor-not-allowed"
                        : "hover:text-[var(--text-primary)] hover:border-[var(--accent-primary)] hover:bg-[var(--surface-hover)]"
                    }`}
                    title={
                      !graph ? "Load a repository to ask questions" : undefined
                    }
                  >
                    {promptText}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col space-y-2 ${
                msg.role === "user" ? "items-end" : "items-start"
              }`}
            >
              <div
                className={`max-w-[90%] rounded-lg p-3 text-xs ${
                  msg.role === "user"
                    ? "bg-[var(--accent-primary)] text-[var(--accent-primary-foreground)] rounded-br-none"
                    : "bg-[var(--surface-card)] border border-[var(--border-default)] text-[var(--text-primary)] rounded-bl-none shadow-xs"
                }`}
              >
                {/* Message body */}
                <div className="whitespace-pre-wrap leading-relaxed">
                  {msg.content ||
                    (msg.status === "streaming" && "Analyzing...")}
                  {msg.status === "streaming" && (
                    <span className="inline-block w-1.5 h-3.5 ml-1 bg-[var(--accent-primary)] animate-pulse align-middle" />
                  )}
                </div>

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
                    className="mt-3 p-2.5 rounded-md bg-[var(--surface-panel-secondary)] border border-[var(--border-subtle)] space-y-2"
                    data-testid="path-trace-card"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--accent-primary)]">
                        <Layers className="w-3.5 h-3.5" />
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
                                  ? "bg-[var(--accent-primary)] text-white border-[var(--accent-primary)]"
                                  : "bg-[var(--surface-card)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:text-[var(--text-primary)]"
                              }`}
                              title={`Step ${idx + 1}: ${fileEntity?.path ?? nodeId}`}
                            >
                              {label}
                            </button>
                            {idx < msg.pathTrace!.stepNodeIds.length - 1 && (
                              <ArrowRight className="w-2.5 h-2.5 text-[var(--text-muted)] shrink-0" />
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
                        className="h-5 px-2 text-[10px] text-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/10"
                      >
                        Highlight On Canvas
                      </Button>
                    </div>
                  </div>
                )}

                {/* Citations section (AC-6) */}
                {msg.citations && msg.citations.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-[var(--border-subtle)] space-y-1.5">
                    <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                      Code Citations
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {msg.citations.map((cite) => (
                        <button
                          key={cite.id}
                          onClick={() => handleCitationClick(cite)}
                          className="flex items-center gap-1 px-2 py-1 rounded bg-[var(--surface-panel-secondary)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-primary)] hover:bg-[var(--surface-hover)] transition-colors"
                          title={`Click to view ${cite.label} at line ${cite.line || 1}`}
                        >
                          <FileCode className="w-3 h-3 text-[var(--accent-primary)]" />
                          <span>
                            {cite.label}
                            {cite.line ? `:${cite.line}` : ""}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Query input footer */}
      <div className="p-3 border-t border-[var(--border-subtle)] bg-[var(--surface-card)]">
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
            className="flex-1 p-2 rounded-md bg-[var(--surface-panel-secondary)] border border-[var(--border-default)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] resize-none disabled:opacity-50"
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
