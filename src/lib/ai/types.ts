import type { Repository, CodebaseGraph, PathTrace } from "@/entities";

export type AiProviderId = "gemini" | "openai" | "claude";

export interface AiProviderConfig {
  readonly provider: AiProviderId;
  readonly model: string;
  readonly isDemoMode: boolean;
  readonly tokenBudget: number;
}

export interface CitationRef {
  readonly id: string;
  readonly fileId: string;
  readonly symbolId?: string | null;
  readonly line?: number | null;
  readonly column?: number | null;
  readonly label: string;
  readonly snippet?: string | null;
}

export type MessageStatus = "idle" | "streaming" | "complete" | "error";

export interface AiQueryMessage {
  readonly id: string;
  readonly threadId: string;
  readonly role: "user" | "assistant" | "system";
  readonly content: string;
  readonly status: MessageStatus;
  readonly errorMessage?: string | null;
  readonly pathTrace?: PathTrace | null;
  readonly citations: readonly CitationRef[];
  readonly isPathVerified: boolean;
  readonly createdAt: string;
}

export interface AiQueryThread {
  readonly id: string;
  readonly repositoryFullName: string;
  readonly messages: readonly AiQueryMessage[];
  readonly activeTraceId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type AIStreamEvent =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "trace"; readonly trace: PathTrace }
  | { readonly type: "citations"; readonly citations: readonly CitationRef[] }
  | { readonly type: "warning"; readonly message: string }
  | { readonly type: "error"; readonly error: string }
  | { readonly type: "done" };

export interface AIRequestContext {
  readonly repository: Repository;
  readonly contextSummary: string;
  readonly graph: CodebaseGraph;
}

export interface AIProvider {
  readonly id: AiProviderId | "demo";
  readonly name: string;
  streamQuery(
    messages: readonly {
      readonly role: "user" | "assistant" | "system";
      readonly content: string;
    }[],
    context: AIRequestContext,
    apiKey?: string,
    signal?: AbortSignal,
  ): AsyncGenerator<AIStreamEvent, void, unknown>;
}
