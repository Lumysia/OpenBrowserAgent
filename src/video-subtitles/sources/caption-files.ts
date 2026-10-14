// Caption files the page loads for its own player, recognized by their
// content (see formats/). Two ways to find them, both started by the user:
// - a small observer in the page's world (see
//   background/video-subtitles/main-world.ts) passes on the text of files
//   loaded from then on;
// - the page's resource timing lists the files loaded before (and those
//   whose request started before the observer); likely caption URLs among
//   them are fetched again. Pages may have cleared those entries.
// Whatever arrives is page data: it is parsed and checked here, and only
// shows in subtitles the user already turned on.
import type { Cue } from "../../shared/video-subtitles/cues";
import { parseCaptionFile } from "../../shared/video-subtitles/formats";
import {
  VIDEO_SUBTITLES_MESSAGE,
  type VideoSubtitlesObserveMessage,
} from "../../shared/video-subtitles/protocol";
import { getBrowserApi } from "../../shared/browser-api";

export type CaptionFile = {
  cues: Cue[];
  // When the page got it (performance.now() time), to tell it from an
  // earlier video's.
  at: number;
};

// Words and extensions in caption file URLs. "timedtext" is the W3C name of
// the format family (TTML).
const CAPTION_URL =
  /caption|subtitle|(^|[^a-z])subs?([^a-z]|$)|timedtext|transcript|\.(vtt|srt|ttml|dfxp)([?#]|$)|[?&](fmt|format)=(vtt|srt|ttml|dfxp|json3?)\b/i;
const FETCHED_TYPES = new Set(["fetch", "xmlhttprequest", "track", "other"]);
// Files fetched again at a time, newest first.
const MAX_FETCHED_AGAIN = 4;

type Listener = (file: CaptionFile) => void;

let latest: CaptionFile | undefined;
const listeners = new Set<Listener>();
let started = false;
// Caption URLs already read, from either way.
const seen = new Set<string>();

// `at`: when the page got the file (performance.now() time).
function accept(url: unknown, text: unknown, at: number) {
  if (typeof url === "string") seen.add(url);
  const parsed = parseCaptionFile(text);
  if (!parsed) return;
  // A file fetched again arrives late: one the page loaded later stays.
  if (latest && latest.at > at) return;
  latest = { cues: parsed.cues, at };
  for (const listener of listeners) listener(latest);
}

// Starts looking once per frame; `listener` gets the newest file now (if
// any) and every newer one.
export function watchCaptionFiles(listener: Listener) {
  listeners.add(listener);
  if (latest) listener(latest);
  if (!started) {
    started = true;
    observe();
    new PerformanceObserver((list) =>
      fetchAgain(list.getEntries() as PerformanceResourceTiming[]),
    ).observe({ type: "resource", buffered: true });
  }
  return () => listeners.delete(listener);
}

function observe() {
  const event = `oba-caption-file-${crypto.randomUUID()}`;
  document.addEventListener(event, (received) => {
    const detail = (received as CustomEvent<unknown>).detail;
    if (typeof detail !== "string") return;
    try {
      const { url, text } = JSON.parse(detail) as {
        url?: unknown;
        text?: unknown;
      };
      accept(url, text, performance.now());
    } catch {
      // Not ours.
    }
  });
  const message: VideoSubtitlesObserveMessage = {
    type: VIDEO_SUBTITLES_MESSAGE.observe,
    event,
  };
  void getBrowserApi()
    .runtime.sendMessage(message)
    .catch(() => undefined);
}

function fetchAgain(entries: PerformanceResourceTiming[]) {
  const likely = entries
    .filter(
      (entry) =>
        FETCHED_TYPES.has(entry.initiatorType) &&
        CAPTION_URL.test(entry.name) &&
        !seen.has(entry.name),
    )
    .sort((a, b) => b.responseEnd - a.responseEnd)
    .slice(0, MAX_FETCHED_AGAIN);
  for (const entry of likely) {
    seen.add(entry.name);
    void fetch(entry.name, { credentials: "include" })
      .then((response) => (response.ok ? response.text() : undefined))
      .then((text) => accept(entry.name, text, entry.responseEnd))
      .catch(() => undefined);
  }
}
