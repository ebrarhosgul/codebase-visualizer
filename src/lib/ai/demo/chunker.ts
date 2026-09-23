import { DEMO_CHUNK_TOKEN_CYCLE } from "./limits";

/**
 * Tokenizes markdown into span-aware chunks where bold and inline code spans are never split.
 * Cycle: 2, 3, 4, 2, 3, 4 tokens per chunk.
 * Guarantees chunks.join("") === markdown.
 */
export function chunkMarkdown(markdown: string): readonly string[] {
  if (!markdown) {
    return Object.freeze([]);
  }

  // Token pattern: bold span, inline code span, or non-whitespace run, followed by any trailing whitespace
  const tokenRegex = /(\*\*[^*]+?\*\*|`[^`\n]+?`|\S+)(\s*)/g;
  const tokens: string[] = [];

  let lastIndex = 0;
  let match: RegExpExecArray | null = null;

  while ((match = tokenRegex.exec(markdown)) !== null) {
    // If there was any leading whitespace before the first token
    if (match.index > lastIndex) {
      const skipped = markdown.slice(lastIndex, match.index);
      if (tokens.length === 0) {
        tokens.push(skipped + match[0]);
        lastIndex = tokenRegex.lastIndex;
        continue;
      } else {
        tokens[tokens.length - 1] += skipped;
      }
    }

    tokens.push(match[0]);
    lastIndex = tokenRegex.lastIndex;
  }

  // If there is any trailing content that wasn't matched (e.g. all whitespace)
  if (lastIndex < markdown.length) {
    const remainder = markdown.slice(lastIndex);
    if (tokens.length > 0) {
      tokens[tokens.length - 1] += remainder;
    } else {
      tokens.push(remainder);
    }
  }

  if (tokens.length === 0) {
    return Object.freeze([]);
  }

  const chunks: string[] = [];
  let tokenIdx = 0;
  let cycleIdx = 0;

  while (tokenIdx < tokens.length) {
    const chunkSize = DEMO_CHUNK_TOKEN_CYCLE[cycleIdx];
    const chunkTokens = tokens.slice(tokenIdx, tokenIdx + chunkSize);
    chunks.push(chunkTokens.join(""));
    tokenIdx += chunkSize;
    cycleIdx = (cycleIdx + 1) % DEMO_CHUNK_TOKEN_CYCLE.length;
  }

  return Object.freeze(chunks);
}

/**
 * Abortable sleep utility for pacing demo token stream.
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}
