// WebVTT (https://www.w3.org/TR/webvtt1/) and SRT, which differ in the
// header, the decimal comma and the markup they allow.
import {
  clockSeconds,
  decodeCueMarkup,
  finishCues,
  plainCueText,
  type Cue,
  type CueWord,
} from "../cues";

const TIMING = /^\s*(\S+)\s+-->\s+(\S+)/;
// An inline timestamp in a cue's text: the time the next words are said.
const INLINE_TIME = /<((?:\d+:)?\d{1,2}:\d{1,2}[.,]\d{1,3})>/g;

export function looksLikeWebVtt(text: string) {
  return /^\uFEFF?WEBVTT(?:[ \t]|\r?\n|$)/.test(text);
}

export function looksLikeSrt(text: string) {
  return /^\uFEFF?\s*\d+[ \t]*\r?\n[ \t]*\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}[ \t]+-->/.test(
    text,
  );
}

export function parseWebVtt(text: string): Cue[] {
  return parseBlocks(text, true);
}

export function parseSrt(text: string): Cue[] {
  return parseBlocks(text, false);
}

function parseBlocks(text: string, vtt: boolean): Cue[] {
  const blocks = text.replace(/^\uFEFF/, "").split(/\r?\n[ \t]*\r?\n/);
  const cues: Cue[] = [];
  for (const block of blocks) {
    const lines = block.split(/\r?\n/);
    const at = lines.findIndex((line) => line.includes("-->"));
    // The header, NOTE, STYLE and REGION blocks have no timing line.
    if (at < 0 || at > 1) continue;
    const timing = TIMING.exec(lines[at]!);
    if (!timing) continue;
    const start = clockSeconds(timing[1]!);
    const end = clockSeconds(timing[2]!);
    if (start === undefined || end === undefined) continue;
    const payload = lines
      .slice(at + 1)
      .join("\n")
      .replace(/\s+$/, "");
    // SRT positions text with `{\an8}`-style tags.
    const markup = vtt ? payload : payload.replace(/\{\\[^}]*\}/g, "");
    const cue: Cue = { start, end, text: plainCueText(markup) };
    const words = vtt ? inlineWords(markup, start) : undefined;
    if (words) cue.words = words;
    cues.push(cue);
  }
  return finishCues(cues);
}

// Words timed by inline timestamps (`one <00:00:01.200>two`), or undefined
// when the cue has none.
function inlineWords(markup: string, start: number): CueWord[] | undefined {
  if (!markup.match(INLINE_TIME)) return undefined;
  const words: CueWord[] = [];
  let time = start;
  let last = 0;
  // Words keep their spacing: scripts written without spaces join as
  // they are.
  const push = (part: string) => {
    const text = decodeCueMarkup(part).replace(/\s+/g, " ");
    if (text.trim()) words.push({ start: time, text });
  };
  for (const match of markup.matchAll(INLINE_TIME)) {
    push(markup.slice(last, match.index));
    time = clockSeconds(match[1]!) ?? time;
    last = match.index! + match[0].length;
  }
  push(markup.slice(last));
  return words.length > 1 ? words : undefined;
}
