// "json3" timed text, recognized by its shape: `{ events: [{ tStartMs,
// dDurationMs, segs: [{ utf8, tOffsetMs }] }] }`. Automatic captions time
// each word with `tOffsetMs` and mark a new speaker with ">>".
import { finishCues, type Cue, type CueWord } from "../cues";

type Segment = { utf8?: unknown; tOffsetMs?: unknown };
type TimedEvent = {
  tStartMs?: unknown;
  dDurationMs?: unknown;
  segs?: unknown;
};

const SPEAKER_MARK = /^\s*>>\s*/;

export function looksLikeJson3(text: string) {
  return /^\uFEFF?\s*\{/.test(text) && /"tStartMs"\s*:/.test(text);
}

export function parseJson3(text: string): Cue[] | undefined {
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    return undefined;
  }
  const events = (data as { events?: unknown } | null)?.events;
  if (!Array.isArray(events)) return undefined;
  const cues: Cue[] = [];
  for (const event of events as TimedEvent[]) {
    if (!event || typeof event !== "object") continue;
    const startMs = number(event.tStartMs);
    const durationMs = number(event.dDurationMs);
    if (startMs === undefined || !Array.isArray(event.segs)) continue;
    const segments = (event.segs as Segment[]).filter(
      (segment) => segment && typeof segment.utf8 === "string",
    );
    const text = segments
      .map((segment) => segment.utf8 as string)
      .join("")
      .replace(SPEAKER_MARK, "")
      .split("\n")
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join("\n");
    // Events that only break the line in a rolling caption window.
    if (!text) continue;
    const start = startMs / 1000;
    const cue: Cue = {
      start,
      end: start + Math.max(durationMs ?? 0, 0) / 1000,
      text,
    };
    const timed = segments.some(
      (segment) => number(segment.tOffsetMs) !== undefined,
    );
    if (timed && segments.length > 1) cue.words = words(segments, startMs);
    cues.push(cue);
  }
  return finishCues(cues);
}

function words(segments: Segment[], startMs: number): CueWord[] {
  return segments.flatMap((segment) => {
    // Spacing kept: scripts written without spaces join as they are.
    const text = (segment.utf8 as string)
      .replace(SPEAKER_MARK, "")
      .replace(/\s+/g, " ");
    return text.trim()
      ? [{ start: (startMs + (number(segment.tOffsetMs) ?? 0)) / 1000, text }]
      : [];
  });
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}
