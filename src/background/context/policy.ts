import { ESTIMATED_CHARS_PER_TOKEN } from "../../shared/config";

// Context engine limits, in estimated tokens. Window-relative limits are
// clamped so small windows still leave room and large ones stay cache-friendly.
export const CONTEXT_POLICY = {
  // A model's window and output limit when neither the user nor Pi's
  // catalog gives one.
  defaultContextWindow: 128_000,
  fallbackOutputTokens: 8_192,
  // Any single tool output above this goes to the artifact store; the model
  // gets a head preview of this size plus a handle.
  toolOutputCapTokens: 5_000,
  // The viewport snapshot act appends when asked, and the items it shows
  // of each long list or table.
  actSnapshotTokens: 1_500,
  actSnapshotItems: 15,
  // `read` returns slices of at most this size.
  readMaxTokens: 5_000,
  // A skill is an instruction set to follow whole, so `read` returns a
  // skill file whole up to this size (four times a normal slice).
  skillReadMaxTokens: 20_000,
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
  // A stored output's label (tool, arguments, source), in characters, and
  // each argument or source field in it.
  outputLabelMaxChars: 300,
  outputLabelPartMaxChars: 80,
  // Long strings of an old call's arguments are replaced past this many
  // characters, keeping the first few.
  shrinkArgumentChars: 120,
  shrinkArgumentKeepChars: 40,
} as const;

export function windowShare(
  window: number,
  limit: { ratio: number; max: number },
) {
  return Math.min(limit.max, Math.floor(window * limit.ratio));
}

// Token limits as characters, for slicing text.
export function tokenChars(tokens: number) {
  return Math.floor(tokens * ESTIMATED_CHARS_PER_TOKEN);
}
