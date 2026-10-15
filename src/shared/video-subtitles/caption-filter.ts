// Which responses may be caption files, decided before anything is read:
// the caption observer (src/video-subtitles/caption-observer.ts) runs on
// every page while subtitles are always on, so everything else costs it a
// header lookup. Dependency-free: it runs in the page's own world.

// Words and extensions in caption file URLs. "timedtext" is the W3C name of
// the format family (TTML).
export const CAPTION_URL =
  /caption|subtitle|(^|[^a-z])subs?([^a-z]|$)|timedtext|transcript|\.(vtt|srt|ttml|dfxp)([?#]|$)|[?&](fmt|format)=(vtt|srt|ttml|dfxp|json3?)\b/i;
// The media types of the caption formats (WebVTT, SRT, TTML).
const CAPTION_TYPE = /\b(vtt|subrip|srt|ttml|ttaf)\b/i;
// Media, images, fonts, streaming manifests and event streams are never
// captions.
const SKIPPED_TYPE =
  /^(video|audio|image|font)\/|mpegurl|dash\+xml|event-stream/i;
// "Some bytes": what many file servers and object stores call any file
// they don't know, caption files included. Only the start is looked at.
const UNNAMED_TYPE = /^(application|binary)\/octet-stream\b/i;

// The bytes looked at in a response of an unnamed type.
export const CAPTION_PEEK_BYTES = 64;

export const CAPTION_READING = {
  // Read it (up to the limit).
  read: "read",
  // Read the first CAPTION_PEEK_BYTES, and on only if they start like a
  // caption file (startsLikeCaptions).
  peek: "peek",
} as const;

export type CaptionReading =
  (typeof CAPTION_READING)[keyof typeof CAPTION_READING];

export type ResponseHead = {
  url: string;
  // The content-type and content-length headers, where the page can read
  // them.
  type: string | null;
  length: string | null;
};

// How much of a response to read, or undefined to leave it: within the
// size limit, and named a caption file by its media type or its URL, or of
// an unnamed type.
export function captionReading(
  { url, type, length }: ResponseHead,
  maxChars: number,
): CaptionReading | undefined {
  if (Number(length) > maxChars) return undefined;
  if (type && SKIPPED_TYPE.test(type)) return undefined;
  if (type && UNNAMED_TYPE.test(type)) return CAPTION_READING.peek;
  return (!!type && CAPTION_TYPE.test(type)) || CAPTION_URL.test(url)
    ? CAPTION_READING.read
    : undefined;
}

// Whether the first bytes of a file may start a caption file (a looser test
// than looksLikeCaptions, for a few bytes).
export function startsLikeCaptions(head: string) {
  const start = head.replace(/^\uFEFF?\s*/, "");
  return (
    /^WEBVTT/.test(start) ||
    /^\d+[ \t]*\r?\n/.test(start) ||
    /^<(\?xml|([\w-]+:)?tt[\s>])/.test(start) ||
    start[0] === "{"
  );
}

// The start of every format the subtitle script reads (a loose test; it
// parses properly).
export function looksLikeCaptions(text: string) {
  const head = text.slice(0, 2000).replace(/^\uFEFF?\s*/, "");
  return (
    /^WEBVTT/.test(head) ||
    /^\d+\s*\r?\n\s*\d+:\d+:\d+[,.]\d+\s+-->/.test(head) ||
    (head[0] === "<" && /<(\w+:)?tt[\s>]/.test(head)) ||
    (head[0] === "{" && /"tStartMs"\s*:/.test(head))
  );
}

// A cue that names a picture rather than saying something: the cues of a
// thumbnail track (the previews shown over a seek bar), such as
// `sprite-01.jpg#xywh=0,0,320,180`.
export const IMAGE_REFERENCE =
  /^\S*(\.(jpe?g|png|webp|gif|avif|bmp)([?#]\S*)?|#xywh=[\w:.,]*)$/i;

// The first line of each cue's text after its timing line.
const CUE_TEXT = /-->[^\r\n]*\r?\n[ \t]*([^\r\n]*)/g;

// A WebVTT file whose cues all name pictures: a thumbnail track, not
// captions.
export function isThumbnailTrack(text: string) {
  let cues = 0;
  for (const [, line = ""] of text.matchAll(CUE_TEXT)) {
    const value = line.trim();
    if (!value) continue;
    if (!IMAGE_REFERENCE.test(value)) return false;
    cues++;
  }
  return cues > 0;
}

// Text the subtitle script may read as a caption file.
export function isCaptionText(text: string) {
  return looksLikeCaptions(text) && !isThumbnailTrack(text);
}
