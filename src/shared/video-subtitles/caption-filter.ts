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
// Media, images, fonts and event streams are never captions.
const SKIPPED_TYPE =
  /^(video|audio|image|font)\/|octet-stream|mpegurl|dash\+xml|event-stream/i;

export type ResponseHead = {
  url: string;
  // The content-type and content-length headers, where the page can read
  // them.
  type: string | null;
  length: string | null;
};

// A response worth reading: not too large, and named a caption file by its
// media type or its URL.
export function isCaptionCandidate(
  { url, type, length }: ResponseHead,
  maxChars: number,
) {
  if (Number(length) > maxChars) return false;
  if (type && SKIPPED_TYPE.test(type)) return false;
  return (!!type && CAPTION_TYPE.test(type)) || CAPTION_URL.test(url);
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
