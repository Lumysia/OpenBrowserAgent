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

// A short key for one line (FNV-1a, 32 bits): it only finds where the text
// changed; the SHA-256 of the whole text decides whether it did.
function lineKey(line: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < line.length; index++) {
    hash ^= line.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function lineKeys(lines: string[]) {
  const max = TASK_LIMITS.baselineLines;
  if (lines.length <= max) return lines.map(lineKey);
  return [
    ...lines.slice(0, max - 1).map(lineKey),
    lineKey(lines.slice(max - 1).join("\n")),
  ];
}

// The first lines, up to `chars` characters in all.
function linesWithin(lines: string[], chars: number) {
  const kept: string[] = [];
  let used = 0;
  for (const line of lines) {
    used += line.length + 1;
    if (used > chars + 1) break;
    kept.push(line);
  }
  return kept;
}

export async function observation(
  text: string,
  at: number,
): Promise<WatchBaseline> {
  const normalized = normalizeWatchedText(text);
  const lines = normalized ? normalized.split("\n") : [];
  const base = {
    hash: await hashText(normalized),
    lines: lineKeys(lines).join(","),
    at,
  };
  if (normalized.length <= TASK_LIMITS.baselineChars)
    return { ...base, text: normalized };
  // Too long to keep whole: its start and its end, half the cap each.
  const half = Math.floor(TASK_LIMITS.baselineChars / 2);
  const head = linesWithin(lines, half);
  const tail = linesWithin(lines.slice(head.length).reverse(), half).reverse();
  return { ...base, text: head.join("\n"), tail: tail.join("\n") };
}

export type WatchCheck =
  | { kind: "first" }
  | { kind: "unchanged" }
  | { kind: "changed"; before: string; after: string };

// A baseline's lines as far as it kept them: the text of line `index`, or
// undefined for a line between the kept start and end.
function keptLines(baseline: WatchBaseline) {
  const head = baseline.text ? baseline.text.split("\n") : [];
  const tail = baseline.tail ? baseline.tail.split("\n") : [];
  const keys = baseline.lines ? baseline.lines.split(",") : head.map(lineKey);
  const tailStart = keys.length - tail.length;
  return {
    keys,
    line: (index: number): string | undefined =>
      index < head.length
        ? head[index]
        : index >= tailStart
          ? tail[index - tailStart]
          : undefined,
  };
}

// Whether the page changed since the baseline, and if so the changed lines
// of both versions with a little unchanged context, each within the cap.
// `text`: the whole normalized text now (else the kept copy of `current`).
export function compareWithBaseline(
  baseline: WatchBaseline | undefined,
  current: WatchBaseline,
  text?: string,
): WatchCheck {
  if (!baseline) return { kind: "first" };
  if (baseline.hash === current.hash) return { kind: "unchanged" };
  const before = keptLines(baseline);
  const now = text === undefined ? keptLines(current) : fullLines(text);
  const { from, beforeTo, afterTo } = changedLines(before.keys, now.keys);
  return {
    kind: "changed",
    before: regionText(before.line, from, beforeTo),
    after: regionText(now.line, from, afterTo),
  };
}

function fullLines(text: string) {
  const lines = text ? text.split("\n") : [];
  return {
    keys: lineKeys(lines),
    line: (index: number): string | undefined => lines[index],
  };
}

// The lines that differ (common start and end trimmed), widened by
// `context` unchanged lines on each side.
function changedLines(
  before: string[],
  after: string[],
  context: number = TASK_LIMITS.changeContextLines,
) {
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
  return {
    from: Math.max(0, start - context),
    beforeTo: Math.min(before.length, before.length - end + context),
    afterTo: Math.min(after.length, after.length - end + context),
  };
}

// Lines `from` to `to`; a run of lines the baseline did not keep shows as
// one note.
function regionText(
  line: (index: number) => string | undefined,
  from: number,
  to: number,
  cap: number = TASK_LIMITS.changeChars,
) {
  const out: string[] = [];
  let missing = 0;
  for (let index = from; index < to; index++) {
    const text = line(index);
    if (text === undefined) {
      missing++;
      continue;
    }
    if (missing) out.push(`[…${missing} lines not kept]`);
    missing = 0;
    out.push(text);
  }
  if (missing) out.push(`[…${missing} lines not kept]`);
  return clip(out, cap);
}

export function changedRegion(
  beforeText: string,
  afterText: string,
  context: number = TASK_LIMITS.changeContextLines,
  cap: number = TASK_LIMITS.changeChars,
) {
  const before = beforeText.split("\n");
  const after = afterText.split("\n");
  const { from, beforeTo, afterTo } = changedLines(before, after, context);
  return {
    before: regionText((index) => before[index], from, beforeTo, cap),
    after: regionText((index) => after[index], from, afterTo, cap),
  };
}

function clip(lines: string[], cap: number) {
  const text = lines.join("\n");
  return text.length > cap ? `${text.slice(0, cap)}\n[…cut]` : text;
}
