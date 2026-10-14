// Caption files recognized by their content, never by where they come from.
import { CAPTION_FILE_LIMITS, type Cue } from "../cues";
import { looksLikeJson3, parseJson3 } from "./json3";
import { looksLikeTtml, parseTtml } from "./ttml";
import { looksLikeSrt, looksLikeWebVtt, parseSrt, parseWebVtt } from "./webvtt";

export const CAPTION_FORMAT = {
  webvtt: "webvtt",
  srt: "srt",
  ttml: "ttml",
  json3: "json3",
} as const;

export type CaptionFormat =
  (typeof CAPTION_FORMAT)[keyof typeof CAPTION_FORMAT];

const FORMATS: Array<{
  format: CaptionFormat;
  looks: (text: string) => boolean;
  parse: (text: string) => Cue[] | undefined;
}> = [
  { format: CAPTION_FORMAT.webvtt, looks: looksLikeWebVtt, parse: parseWebVtt },
  { format: CAPTION_FORMAT.srt, looks: looksLikeSrt, parse: parseSrt },
  { format: CAPTION_FORMAT.ttml, looks: looksLikeTtml, parse: parseTtml },
  { format: CAPTION_FORMAT.json3, looks: looksLikeJson3, parse: parseJson3 },
];

// The file's cues, or undefined when it isn't a caption file or has none.
export function parseCaptionFile(
  text: unknown,
): { format: CaptionFormat; cues: Cue[] } | undefined {
  if (typeof text !== "string" || text.length > CAPTION_FILE_LIMITS.maxChars)
    return undefined;
  const source = text.trimStart();
  const head = source.slice(0, 4000);
  for (const { format, looks, parse } of FORMATS) {
    if (!looks(head)) continue;
    const cues = parse(source);
    return cues?.length ? { format, cues } : undefined;
  }
  return undefined;
}
