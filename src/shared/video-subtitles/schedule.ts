// Which subtitle lines to translate, and which one shows, at a time in the
// video. Dependency-free: the page script imports this module.
import type { SubtitleLine } from "./segment";

// Lines are translated from just behind the playhead to this far ahead of
// it, never the whole video at once: it bounds what a long video costs with
// the AI model and follows seeks.
export const SUBTITLE_WINDOW = {
  behindSeconds: 2,
  aheadSeconds: 120,
} as const;

// The index of the last line starting at or before `time` (-1 if none).
// `lines` are in start order.
function lastStartedIndex(lines: readonly SubtitleLine[], time: number) {
  let low = 0;
  let high = lines.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (lines[middle]!.start <= time) {
      found = middle;
      low = middle + 1;
    } else high = middle - 1;
  }
  return found;
}

// The line on screen at `time`: the latest one that started and hasn't
// ended.
export function lineAt(lines: readonly SubtitleLine[], time: number) {
  for (let index = lastStartedIndex(lines, time); index >= 0; index--) {
    const line = lines[index]!;
    if (line.end > time) return line;
    // Lines are short; one that started long ago is over.
    if (time - line.start > 60) break;
  }
  return undefined;
}

// Lines within the window around `time`, nearest first: those on screen,
// then those ahead in order.
export function linesInWindow(lines: readonly SubtitleLine[], time: number) {
  const from = time - SUBTITLE_WINDOW.behindSeconds;
  const to = time + SUBTITLE_WINDOW.aheadSeconds;
  const result: SubtitleLine[] = [];
  let index = lastStartedIndex(lines, from);
  // Lines that started before the window but are still on screen.
  while (index > 0 && lines[index - 1]!.end > from) index--;
  for (index = Math.max(index, 0); index < lines.length; index++) {
    const line = lines[index]!;
    if (line.start > to) break;
    if (line.end > from) result.push(line);
  }
  return result;
}
