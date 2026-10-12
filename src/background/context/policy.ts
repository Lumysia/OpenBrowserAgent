import { BROWSER_TOOL_NAME } from "../../shared/browser-tools";

// Context engine limits, in estimated tokens. Window-relative limits are
// clamped so small windows still leave room and large ones stay cache-friendly.
export const CONTEXT_POLICY = {
  defaultContextWindow: 128_000,
  // Any single tool output above this goes to the artifact store; the model
  // gets a head preview of this size plus a handle.
  toolOutputCapTokens: 5_000,
  // `read` pages through artifacts in slices of at most this size.
  readMaxTokens: 5_000,
  // The newest tool outputs, up to this budget, are never masked.
  protectRecentToolTokens: { ratio: 0.3, max: 40_000 },
  // Older outputs are masked together once at least this much can go, so
  // the cached prefix changes rarely.
  maskBatchTokens: { ratio: 0.2, max: 30_000 },
  // Compaction starts when the request would exceed this share of the window.
  compactAtRatio: 0.75,
  // Compaction keeps the most recent turns verbatim, up to this budget.
  keepRecentTokens: { ratio: 0.2, max: 20_000 },
  // Tool outputs are shortened to this many characters for the summarizer.
  summaryToolOutputChars: 2_000,
  // Masking skips outputs this small: the stub would save nothing.
  minMaskChars: 600,
} as const;

export function windowShare(
  window: number,
  limit: { ratio: number; max: number },
) {
  return Math.min(limit.max, Math.floor(window * limit.ratio));
}

const always = () => true;

// Calls that only observe state. They may run in parallel with each other,
// and an identical repeat with identical output is answered with a stub.
// Tools absent here run sequentially in the model's order.
const READ_ONLY_TOOLS: Record<
  string,
  (input: Record<string, unknown>) => boolean
> = {
  [BROWSER_TOOL_NAME.read]: always,
  [BROWSER_TOOL_NAME.inspectPage]: always,
  [BROWSER_TOOL_NAME.getCurrentTab]: always,
  [BROWSER_TOOL_NAME.getCurrentTime]: always,
  [BROWSER_TOOL_NAME.readFileFromUrl]: always,
  [BROWSER_TOOL_NAME.readUploadedAttachment]: always,
  [BROWSER_TOOL_NAME.manageTabs]: (input) => input.operation === "list",
};

export function runsInParallel(toolName: string) {
  return READ_ONLY_TOOLS[toolName] === always;
}

export function isRepeatGuarded(
  toolName: string,
  input: Record<string, unknown>,
) {
  return (
    toolName !== BROWSER_TOOL_NAME.read &&
    toolName !== BROWSER_TOOL_NAME.getCurrentTime &&
    !!READ_ONLY_TOOLS[toolName]?.(input)
  );
}
