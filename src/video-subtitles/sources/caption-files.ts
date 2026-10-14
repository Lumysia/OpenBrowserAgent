// Caption files the page loads for its own player, recognized by their
// content (see formats/). Two ways to find them, both started by the user:
// - files loaded before: the likely caption URLs in the page's resource
//   timing, fetched again (pages may have cleared those entries);
// - files loaded from now on: a small observer in the page's world (see
//   background/video-subtitles/main-world.ts) passes on their text.
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
  // When it arrived (performance.now()), to tell it from an earlier
  // video's.
  at: number;
};

// Words and extensions in caption file URLs. "timedtext" is the W3C name of
// the format family (TTML).
const CAPTION_URL =
  /caption|subtitle|(^|[^a-z])subs?([^a-z]|$)|timedtext|transcript|\.(vtt|srt|ttml|dfxp)([?#]|$)|[?&](fmt|format)=(vtt|srt|ttml|dfxp|json3?)\b/i;
const FETCHED_TYPES = new Set(["fetch", "xmlhttprequest", "track", "other"]);
// Earlier files fetched again, newest first.
const MAX_EARLIER_FILES = 4;

type Listener = (file: CaptionFile) => void;

let latest: CaptionFile | undefined;
const listeners = new Set<Listener>();
let started = false;

function accept(text: unknown, at = performance.now()) {
  const parsed = parseCaptionFile(text);
  if (!parsed) return;
  // An earlier file fetched again arrives late: a newer one stays.
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
    void fetchEarlier();
  }
  return () => listeners.delete(listener);
}

function observe() {
  const event = `oba-caption-file-${crypto.randomUUID()}`;
  document.addEventListener(event, (received) => {
    const detail = (received as CustomEvent<unknown>).detail;
    if (typeof detail !== "string") return;
    try {
      accept((JSON.parse(detail) as { text?: unknown }).text);
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

async function fetchEarlier() {
  const entries = (
    performance.getEntriesByType("resource") as PerformanceResourceTiming[]
  )
    .filter(
      (entry) =>
        FETCHED_TYPES.has(entry.initiatorType) && CAPTION_URL.test(entry.name),
    )
    .sort((a, b) => b.responseEnd - a.responseEnd);
  const urls = [...new Set(entries.map((entry) => entry.name))].slice(
    0,
    MAX_EARLIER_FILES,
  );
  await Promise.all(
    urls.map(async (url, index) => {
      try {
        const response = await fetch(url, { credentials: "include" });
        if (!response.ok) return;
        // Older files rank below newer ones and below anything observed.
        accept(await response.text(), -1 - index);
      } catch {
        // Gone, or not readable from here.
      }
    }),
  );
}
