// Context engine limits, in estimated tokens. Window-relative limits are
// clamped so small windows still leave room and large ones stay cache-friendly.
export const CONTEXT_POLICY = {
  defaultContextWindow: 128_000,
  // Any single tool output above this goes to the artifact store; the model
  // gets a head preview of this size plus a handle.
  toolOutputCapTokens: 5_000,
  // `read` returns slices of at most this size.
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
  // Share of the summarizing (helper) model's window a compaction
  // transcript or an extract page may fill.
  helperInputRatio: 0.6,
  // Tool outputs are shortened to this many characters for the summarizer.
  summaryToolOutputChars: 2_000,
  // Masking skips outputs this small: the stub would save nothing.
  minMaskChars: 600,
  // Tool outputs of earlier turns are replayed shortened to this size; a
  // longer output keeps its full text as an artifact.
  historyToolOutputTokens: 300,
  // All replayed outputs of one earlier turn together; past this, its
  // older outputs are replayed as one-line stubs.
  historyTurnToolTokens: 4_000,
} as const;

export function windowShare(
  window: number,
  limit: { ratio: number; max: number },
) {
  return Math.min(limit.max, Math.floor(window * limit.ratio));
}

// Characters per estimated token, for turning token limits into slices.
const CHARS_PER_TOKEN = 3.5;

export function tokenChars(tokens: number) {
  return Math.floor(tokens * CHARS_PER_TOKEN);
}
