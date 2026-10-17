// Whether text a player draws over its video is the captions we have as
// cues: the player shows the line said now, a growing part of it (rolling
// captions), or the end of one line with the start of the next, wrapped and
// spaced its own way. Dependency-free: the page script imports this module.
import type { Cue } from "./cues";

export const CAPTION_MATCH = {
  // Cues this long before and after the playhead may be on screen (a
  // player keeps a line up a while, or shows the next one a bit early).
  behindSeconds: 10,
  aheadSeconds: 3,
  // Letters and digits the text needs, so a short word doesn't match some
  // other text over the video.
  minChars: 10,
  // A cue lasts at most this long when looking back for the ones on screen.
  maxCueSeconds: 60,
} as const;

// Letters and digits only, compared without case: spacing, line breaks and
// punctuation are the player's own.
export function captionKey(text: string) {
  return text
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

// The text of the cues that may be on screen at `time`, in order, as one
// key. `cues` are in start order.
export function cueKeyAround(cues: readonly Cue[], time: number) {
  const from = time - CAPTION_MATCH.behindSeconds;
  const to = time + CAPTION_MATCH.aheadSeconds;
  let low = 0;
  let high = cues.length;
  // The first cue starting after `to`.
  while (low < high) {
    const middle = (low + high) >> 1;
    if (cues[middle]!.start <= to) low = middle + 1;
    else high = middle;
  }
  const near: string[] = [];
  for (let index = low - 1; index >= 0; index--) {
    const cue = cues[index]!;
    if (cue.start < from - CAPTION_MATCH.maxCueSeconds) break;
    if (cue.end >= from) near.push(cue.text);
  }
  return captionKey(near.reverse().join(" "));
}

// Whether `text` is long enough to tell and part of the cues' `key`.
export function isCaptionOf(text: string, key: string) {
  const value = captionKey(text);
  return (
    [...value].length >= CAPTION_MATCH.minChars &&
    /\p{L}/u.test(value) &&
    key.includes(value)
  );
}
