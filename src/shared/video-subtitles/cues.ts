// Subtitle cues as every caption format becomes them. Dependency-free: the
// page script imports this module.
import { CAPTION_RESPONSE_MAX_CHARS } from "./protocol";

// A word with its own time, from formats that time each word (automatic
// captions).
export type CueWord = {
  // Seconds from the start of the video.
  start: number;
  text: string;
};

export type Cue = {
  // Seconds from the start of the video.
  start: number;
  end: number;
  // Plain text; lines of one cue are separated by "\n".
  text: string;
  words?: CueWord[];
};

// Limits on what a caption file may hold before it is ignored: files come
// from the page.
export const CAPTION_FILE_LIMITS = {
  // Characters of the file's text.
  maxChars: CAPTION_RESPONSE_MAX_CHARS,
  maxCues: 20_000,
} as const;

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
  lrm: "\u200e",
  rlm: "\u200f",
};

// Markup removed (`<br>` becomes a line break) and entities decoded,
// spacing kept.
export function decodeCueMarkup(markup: string) {
  return markup
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
      if (name[0] === "#") {
        const code =
          name[1] === "x" || name[1] === "X"
            ? parseInt(name.slice(2), 16)
            : parseInt(name.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : entity;
      }
      return ENTITIES[name.toLowerCase()] ?? entity;
    });
}

// Decoded text with each line's spacing collapsed and empty lines dropped.
export function plainCueText(markup: string) {
  return decodeCueMarkup(markup)
    .split("\n")
    .map((line) => line.replace(/[ \t\u00a0]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

// `hh:mm:ss.mmm`, `mm:ss.mmm` or with a comma (SRT) in seconds; undefined
// when it isn't one.
export function clockSeconds(value: string): number | undefined {
  const match = /^\s*(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?\s*$/.exec(
    value,
  );
  if (!match) return undefined;
  const [, hours = "0", minutes, seconds, fraction = "0"] = match;
  return (
    Number(hours) * 3600 +
    Number(minutes) * 60 +
    Number(seconds) +
    Number(fraction.padEnd(3, "0")) / 1000
  );
}

// Cues that can be shown: timed, non-empty, in time order, within the
// limits.
export function finishCues(cues: Cue[]): Cue[] {
  return cues
    .filter(
      (cue) =>
        Number.isFinite(cue.start) &&
        Number.isFinite(cue.end) &&
        cue.start >= 0 &&
        cue.end > cue.start &&
        cue.text.trim(),
    )
    .slice(0, CAPTION_FILE_LIMITS.maxCues)
    .sort((a, b) => a.start - b.start || a.end - b.end);
}
