"use client";

import React, { useState, useEffect } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Key,
  Shield,
  Trash2,
  CheckCircle2,
  Video,
  MessageSquare,
  Eye,
  EyeOff,
} from "lucide-react";
import type { AiProviderId } from "@/lib/ai/types";

export type KeyDialogProviderId = AiProviderId | "scrimba";

export interface KeySettingsDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly initialProvider?: KeyDialogProviderId;
  readonly configuredProviders?: readonly KeyDialogProviderId[];
  readonly maskedKeys?: Readonly<Partial<Record<KeyDialogProviderId, string>>>;
  readonly onKeySaved?: (provider: KeyDialogProviderId) => void;
  readonly onKeyCleared?: (deletedProvider?: KeyDialogProviderId) => void;
}

const CHAT_PROVIDERS: readonly {
  id: AiProviderId;
  name: string;
  hint: string;
}[] = [
  {
    id: "gemini",
    name: "Google Gemini",
    hint: "Default provider. Requires Gemini API key.",
  },
  {
    id: "openai",
    name: "OpenAI GPT",
    hint: "Requires OpenAI API key with chat access.",
  },
  {
    id: "claude",
    name: "Anthropic Claude",
    hint: "Requires Anthropic API key.",
  },
];

const VIDEO_PROVIDERS: readonly {
  id: "scrimba";
  name: string;
  hint: string;
}[] = [
  {
    id: "scrimba",
    name: "Scrimba Explain",
    hint: "Requires personal Scrimba API key starting with scr_live_ for video walkthroughs.",
  },
];

const ALL_PROVIDERS = [...CHAT_PROVIDERS, ...VIDEO_PROVIDERS];

function formatMaskedKey(rawKey: string): string {
  const trimmed = rawKey.trim();
  if (trimmed.length <= 8) {
    return "••••••••";
  }
  return `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`;
}

export function KeySettingsDialog({
  open,
  onOpenChange,
  initialProvider,
  configuredProviders,
  maskedKeys,
  onKeySaved,
  onKeyCleared,
}: KeySettingsDialogProps): React.JSX.Element {
  const [selectedProvider, setSelectedProvider] = useState<KeyDialogProviderId>(
    initialProvider ?? "gemini",
  );
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [localConfiguredProviders, setLocalConfiguredProviders] = useState<
    readonly KeyDialogProviderId[]
  >(configuredProviders ?? []);
  const [localMaskedKeys, setLocalMaskedKeys] = useState<
    Partial<Record<KeyDialogProviderId, string>>
  >(maskedKeys ?? {});

  useEffect(() => {
    if (initialProvider) {
      setSelectedProvider(initialProvider);
    }
    setStatusMessage(null);
    setApiKey("");
    setShowApiKey(false);
  }, [initialProvider, open]);

  useEffect(() => {
    if (configuredProviders) {
      setLocalConfiguredProviders(configuredProviders);
    }
  }, [configuredProviders]);

  useEffect(() => {
    if (maskedKeys) {
      setLocalMaskedKeys(maskedKeys);
    }
  }, [maskedKeys]);

  const activeProviderMeta = ALL_PROVIDERS.find(
    (p) => p.id === selectedProvider,
  );

  const handleSaveKey = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = apiKey.trim();
    if (!trimmed) {
      setStatusMessage({ type: "error", text: "Please enter an API key." });
      return;
    }

    if (
      selectedProvider === "scrimba" &&
      (!trimmed.startsWith("scr_live_") || trimmed.length < 16)
    ) {
      setStatusMessage({
        type: "error",
        text: "Please enter a valid Scrimba API key starting with scr_live_ (at least 16 characters).",
      });
      return;
    }

    setIsSubmitting(true);
    setStatusMessage(null);

    try {
      const res = await fetch("/api/ai/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: selectedProvider,
          apiKey: trimmed,
        }),
      });

      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = (await res.json().catch(() => ({}))) as {
        maskedKey?: string;
      };
      const masked = data.maskedKey ?? formatMaskedKey(trimmed);

      setLocalConfiguredProviders((prev) =>
        prev.includes(selectedProvider) ? prev : [...prev, selectedProvider],
      );
      setLocalMaskedKeys((prev) => ({
        ...prev,
        [selectedProvider]: masked,
      }));

      setStatusMessage({
        type: "success",
        text: `Key for ${selectedProvider} securely saved in encrypted cookie.`,
      });
      setApiKey("");
      onKeySaved?.(selectedProvider);
    } catch (err: unknown) {
      setStatusMessage({
        type: "error",
        text:
          err instanceof Error
            ? err.message
            : "Failed to save API credentials.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteProviderKey = async (providerId: KeyDialogProviderId) => {
    setIsSubmitting(true);
    setStatusMessage(null);

    try {
      const res = await fetch(
        `/api/ai/keys?provider=${encodeURIComponent(providerId)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      setLocalConfiguredProviders((prev) =>
        prev.filter((id) => id !== providerId),
      );
      setLocalMaskedKeys((prev) => {
        const next = { ...prev };
        delete next[providerId];
        return next;
      });
      setStatusMessage({
        type: "success",
        text: `Stored ${providerId} credentials cleared.`,
      });
      onKeyCleared?.(providerId);
    } catch (err: unknown) {
      setStatusMessage({
        type: "error",
        text:
          err instanceof Error ? err.message : "Failed to clear credentials.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClearKey = async () => {
    setIsSubmitting(true);
    setStatusMessage(null);

    try {
      const endpoint =
        selectedProvider === "scrimba"
          ? "/api/ai/keys?scope=video"
          : "/api/ai/keys?scope=chat";
      const res = await fetch(endpoint, { method: "DELETE" });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      if (selectedProvider === "scrimba") {
        setLocalConfiguredProviders((prev) =>
          prev.filter((id) => id !== "scrimba"),
        );
        setLocalMaskedKeys((prev) => {
          const next = { ...prev };
          delete next.scrimba;
          return next;
        });
      } else {
        setLocalConfiguredProviders((prev) =>
          prev.filter((id) => id === "scrimba"),
        );
        setLocalMaskedKeys((prev) =>
          prev.scrimba ? { scrimba: prev.scrimba } : {},
        );
      }
      setStatusMessage({
        type: "success",
        text: `Stored ${selectedProvider === "scrimba" ? "video" : "API"} credentials cleared.`,
      });
      onKeyCleared?.();
    } catch (err: unknown) {
      setStatusMessage({
        type: "error",
        text:
          err instanceof Error ? err.message : "Failed to clear credentials.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const keyCount = localConfiguredProviders.length;

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setStatusMessage(null);
      setApiKey("");
      setShowApiKey(false);
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
      data-testid="key-settings-dialog"
      title="Bring Your Own Key (BYOK)"
      description="Store API keys securely in an AES-256-GCM encrypted browser cookie. Keys are never logged or persisted on our servers."
    >
      <form onSubmit={handleSaveKey} className="space-y-4 pt-2">
        {/* Configured Keys Summary Section */}
        <div
          className="p-2.5 rounded-md bg-surface-canvas border border-border-default space-y-2"
          data-testid="configured-keys-summary"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-primary">
              Configured Keys
            </span>
            <span
              className="text-[11px] font-mono px-1.5 py-0.5 rounded-sm bg-surface-panel-secondary border border-border-subtle text-text-secondary"
              data-testid="configured-keys-count"
            >
              {keyCount} {keyCount === 1 ? "key" : "keys"} configured
            </span>
          </div>

          {keyCount === 0 ? (
            <p
              className="text-[11px] text-text-muted"
              data-testid="no-configured-keys-msg"
            >
              No API keys configured yet. Add a provider key below to enable
              live queries.
            </p>
          ) : (
            <div className="space-y-1.5">
              {localConfiguredProviders.map((providerId) => {
                const meta = ALL_PROVIDERS.find((p) => p.id === providerId);
                const label = meta?.name ?? providerId;
                const masked = localMaskedKeys[providerId];

                return (
                  <div
                    key={providerId}
                    data-testid={`configured-key-item-${providerId}`}
                    className="flex items-center justify-between px-2 py-1 rounded-sm bg-surface-panel border border-border-subtle text-xs"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <CheckCircle2 className="w-3.5 h-3.5 text-status-success shrink-0" />
                      <span className="font-medium text-text-primary truncate">
                        {label}
                      </span>
                      <span className="text-[10px] uppercase font-mono px-1 py-0.2 rounded-xs bg-surface-active text-text-secondary">
                        {providerId}
                      </span>
                      {masked && (
                        <span
                          className="text-[10px] font-mono text-text-muted"
                          data-testid={`masked-key-${providerId}`}
                        >
                          {masked}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteProviderKey(providerId)}
                      disabled={isSubmitting}
                      data-testid={`delete-key-${providerId}`}
                      aria-label={`Delete ${label} key`}
                      title={`Delete ${label} key`}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[11px] text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Remove</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Chat Providers Section */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-primary flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5 text-text-secondary" />
            <span>Chat Providers</span>
          </label>
          <div className="grid grid-cols-3 gap-2">
            {CHAT_PROVIDERS.map((p) => {
              const isSelected = selectedProvider === p.id;
              const isConfigured = localConfiguredProviders.includes(p.id);
              return (
                <button
                  type="button"
                  key={p.id}
                  data-testid={`provider-radio-${p.id}`}
                  data-selected={isSelected}
                  data-configured={isConfigured}
                  onClick={() => {
                    setSelectedProvider(p.id);
                    setStatusMessage(null);
                  }}
                  className={`p-2 rounded-md border text-left text-xs transition-colors cursor-pointer ${
                    isSelected
                      ? "border-accent-border bg-surface-active text-text-primary font-medium"
                      : "border-border-default bg-surface-canvas text-text-secondary hover:text-text-primary hover:border-border-strong"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate">{p.name}</span>
                    {isConfigured && (
                      <CheckCircle2
                        className="w-3 h-3 text-status-success shrink-0"
                        data-testid={`provider-configured-${p.id}`}
                        aria-label={`${p.name} key configured`}
                      />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Video Provider Section */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-primary flex items-center gap-1.5">
            <Video className="w-3.5 h-3.5 text-text-secondary" />
            <span>Video Provider</span>
          </label>
          <div className="grid grid-cols-1 gap-2">
            {VIDEO_PROVIDERS.map((p) => {
              const isSelected = selectedProvider === p.id;
              const isConfigured = localConfiguredProviders.includes(p.id);
              return (
                <button
                  type="button"
                  key={p.id}
                  data-testid={`provider-radio-${p.id}`}
                  data-selected={isSelected}
                  data-configured={isConfigured}
                  onClick={() => {
                    setSelectedProvider(p.id);
                    setStatusMessage(null);
                  }}
                  className={`p-2 rounded-md border text-left text-xs transition-colors cursor-pointer ${
                    isSelected
                      ? "border-accent-border bg-surface-active text-text-primary font-medium"
                      : "border-border-default bg-surface-canvas text-text-secondary hover:text-text-primary hover:border-border-strong"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span>{p.name}</span>
                      {isConfigured && (
                        <CheckCircle2
                          className="w-3 h-3 text-status-success shrink-0"
                          data-testid={`provider-configured-${p.id}`}
                          aria-label={`${p.name} key configured`}
                        />
                      )}
                    </div>
                    <span className="text-[10px] text-text-muted font-mono">
                      scr_live_...
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-text-muted pt-0.5">
            {activeProviderMeta?.hint}
          </p>
        </div>

        {/* API key input */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-primary flex items-center gap-1.5">
            <Key className="w-3.5 h-3.5 text-text-secondary" />
            <span>API Key</span>
          </label>
          <div className="relative flex items-center">
            <Input
              type={showApiKey ? "text" : "password"}
              placeholder={
                selectedProvider === "scrimba"
                  ? "Enter your Scrimba API key (scr_live_...)"
                  : `Enter your ${selectedProvider} API key...`
              }
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full text-xs pr-8"
              autoComplete="off"
              data-testid="api-key-input"
            />
            <button
              type="button"
              onClick={() => setShowApiKey((prev) => !prev)}
              data-testid="toggle-key-visibility"
              aria-label={showApiKey ? "Hide API key" : "Show API key"}
              title={showApiKey ? "Hide API key" : "Show API key"}
              className="absolute right-2 text-text-muted hover:text-text-primary transition-colors cursor-pointer"
            >
              {showApiKey ? (
                <EyeOff className="w-3.5 h-3.5" />
              ) : (
                <Eye className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Status notification */}
        {statusMessage && (
          <div
            className={`p-2.5 rounded-md text-xs flex items-center gap-2 ${
              statusMessage.type === "success"
                ? "bg-status-success/10 border border-status-success/20 text-status-success"
                : "bg-red-500/10 border border-red-500/20 text-red-300"
            }`}
          >
            {statusMessage.type === "success" && (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-status-success" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-border-subtle">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClearKey}
            loading={isSubmitting}
            data-testid="clear-key-btn"
            className="text-red-400 hover:bg-red-500/10 hover:text-red-300 gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear Stored Key</span>
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => handleOpenChange(false)}
              data-testid="close-key-dialog-btn"
            >
              Close
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={isSubmitting}
              data-testid="save-key-btn"
              className="gap-1.5"
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Save Encrypted</span>
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
