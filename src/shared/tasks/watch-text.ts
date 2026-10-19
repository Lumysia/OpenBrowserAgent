import { TASK_LIMITS, type WatchBaseline } from "./types";

// What a watch compares: the watched text with runs of spaces folded and
// blank lines dropped, so reflowed markup is no change.
export function normalizeWatchedText(text: string) {
  return text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

export async function hashText(text: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function observation(
  text: string,
  at: number,
): Promise<WatchBaseline> {
  const normalized = normalizeWatchedText(text);
  return {
    // The whole text decides whether it changed; a bounded copy is kept to
    // show the model what changed.
    hash: await hashText(normalized),
    text: normalized.slice(0, TASK_LIMITS.baselineChars),
    at,
  };
}

export type WatchCheck =
  | { kind: "first" }
  | { kind: "unchanged" }
  | { kind: "changed"; before: string; after: string };

// Whether the page changed since the baseline, and if so the changed lines
// of both versions with a little unchanged context, each within the cap.
export function compareWithBaseline(
  baseline: WatchBaseline | undefined,
  current: WatchBaseline,
): WatchCheck {
  if (!baseline) return { kind: "first" };
  if (baseline.hash === current.hash) return { kind: "unchanged" };
  const { before, after } = changedRegion(baseline.text, current.text);
  return { kind: "changed", before, after };
}

export function changedRegion(
  beforeText: string,
  afterText: string,
  context: number = TASK_LIMITS.changeContextLines,
  cap: number = TASK_LIMITS.changeChars,
) {
  const before = beforeText.split("\n");
  const after = afterText.split("\n");
  let start = 0;
  while (
    start < before.length &&
    start < after.length &&
    before[start] === after[start]
  )
    start++;
  let end = 0;
  while (
    end < before.length - start &&
    end < after.length - start &&
    before[before.length - 1 - end] === after[after.length - 1 - end]
  )
    end++;
  const from = Math.max(0, start - context);
  const slice = (lines: string[]) =>
    clip(
      lines.slice(from, Math.min(lines.length, lines.length - end + context)),
      cap,
    );
  return { before: slice(before), after: slice(after) };
}

function clip(lines: string[], cap: number) {
  const text = lines.join("\n");
  return text.length > cap ? `${text.slice(0, cap)}\n[…cut]` : text;
}
