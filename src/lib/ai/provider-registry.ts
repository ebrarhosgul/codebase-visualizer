import type { AIProvider, AiProviderId } from "./types";
import { DemoAIProvider } from "./demo-provider";
import { GeminiAIProvider } from "./gemini-provider";
import { OpenAIProvider } from "./openai-provider";
import { ClaudeProvider } from "./claude-provider";

const demoProvider = new DemoAIProvider();
const geminiProvider = new GeminiAIProvider();
const openaiProvider = new OpenAIProvider();
const claudeProvider = new ClaudeProvider();

/**
 * Returns the appropriate AIProvider based on provider id and demo mode flag.
 */
export function getAIProvider(
  providerId: AiProviderId | "demo" = "gemini",
  isDemo = false,
): AIProvider {
  if (isDemo || providerId === "demo") {
    return demoProvider;
  }

  switch (providerId) {
    case "openai":
      return openaiProvider;
    case "claude":
      return claudeProvider;
    case "gemini":
    default:
      return geminiProvider;
  }
}
