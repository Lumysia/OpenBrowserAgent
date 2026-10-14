// Cues grouped into the lines that are translated and shown: whole
// sentences where the timing allows. Automatic captions are time slices,
// not sentences; human ones are usually a line each, and a sentence over
// two cues reads (and translates) better as one. Dependency-free: the page
// script imports this module.
import type { Cue } from "./cues";

export type SubtitleLine = {
  // Seconds from the start of the video.
  start: number;
  end: number;
  // The original text, translated as one item.
  text: string;
};

export const SEGMENT_LIMITS = {
  // A pause this long between words or cues ends a line.
  pauseSeconds: 0.6,
  // A timed word is said for at most this long.
  wordSeconds: 1,
  maxWords: 32,
  maxChars: 200,
} as const;

type Piece = {
  start: number;
  end: number;
  text: string;
  // Joins the text before it with a space: a cue's first word or a whole
  // cue. The other words of a cue bring their own spacing.
  spaced: boolean;
};

// Sentence-final punctuation, then closing quotes or brackets.
const SENTENCE_END = /[.!?…。！？][\s"'”’)\]」』]*$/u;

const segmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "word" })
    : undefined;

function wordCount(text: string) {
  if (!segmenter) return text.split(/\s+/).filter(Boolean).length;
  let count = 0;
  for (const part of segmenter.segment(text)) if (part.isWordLike) count++;
  return count;
}

export function segmentCues(cues: readonly Cue[]): SubtitleLine[] {
  const lines: SubtitleLine[] = [];
  let group: Piece[] = [];
  let words = 0;
  const flush = () => {
    if (!group.length) return;
    const text = joinPieces(group);
    if (text)
      lines.push({
        start: group[0]!.start,
        end: Math.max(...group.map((piece) => piece.end)),
        text,
      });
    group = [];
    words = 0;
  };
  for (const piece of pieces(cues)) {
    const last = group[group.length - 1];
    const count = wordCount(piece.text);
    if (
      last &&
      (SENTENCE_END.test(last.text.trim()) ||
        piece.start - last.end > SEGMENT_LIMITS.pauseSeconds ||
        words + count > SEGMENT_LIMITS.maxWords ||
        joinPieces([...group, piece]).length > SEGMENT_LIMITS.maxChars)
    )
      flush();
    group.push(piece);
    words += count;
  }
  flush();
  // Overlapping lines (rolling captions keep a line up while the next one
  // is said) end where the next begins.
  for (let index = 0; index + 1 < lines.length; index++) {
    const line = lines[index]!;
    const next = lines[index + 1]!;
    if (line.end > next.start && next.start > line.start) line.end = next.start;
  }
  return lines;
}

function* pieces(cues: readonly Cue[]): Generator<Piece> {
  let previous: string[] = [];
  for (const cue of cues) {
    if (cue.words?.length) {
      const words = cue.words;
      for (let index = 0; index < words.length; index++) {
        const word = words[index]!;
        const next = words[index + 1]?.start ?? cue.end;
        yield {
          start: word.start,
          end: Math.min(next, word.start + SEGMENT_LIMITS.wordSeconds),
          text: word.text,
          spaced: index === 0,
        };
      }
      previous = [];
      continue;
    }
    // Rolling captions repeat the previous cue's last lines first.
    let lines = cue.text.split("\n");
    let repeated = Math.min(previous.length, lines.length - 1);
    while (
      repeated > 0 &&
      lines.slice(0, repeated).join("\n") !==
        previous.slice(previous.length - repeated).join("\n")
    )
      repeated--;
    previous = lines;
    lines = lines.slice(repeated);
    yield {
      start: cue.start,
      end: cue.end,
      text: lines.join(" "),
      spaced: true,
    };
  }
}

function joinPieces(group: Piece[]) {
  let text = "";
  for (const piece of group) {
    if (!text) text = piece.text;
    else text += piece.spaced ? ` ${piece.text}` : piece.text;
  }
  return text.replace(/\s+/g, " ").trim();
}
