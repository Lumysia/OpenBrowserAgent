// Caption files the page loads for its own player, recognized by their
// content (see formats/). Two ways to find them:
// - the caption observer in the page's world (see caption-observer.ts)
//   passes on the text of the files the page loads: from the page's start
//   while subtitles are always on, else from when the user starts them;
// - the page's resource timing lists the files loaded before (and those
//   whose request started before the observer); likely caption URLs among
//   them are fetched again once a video wants subtitles. Pages may have
//   cleared those entries.
// Whatever arrives is page data: it is parsed and checked here, and only
// the newest file is kept, for the frame's videos.
import type { Cue } from "../../shared/video-subtitles/cues";
import { CAPTION_URL } from "../../shared/video-subtitles/caption-filter";
import { parseCaptionFile } from "../../shared/video-subtitles/formats";
import {
  CAPTION_FILE_EVENT,
  VIDEO_SUBTITLES_MESSAGE,
} from "../../shared/video-subtitles/protocol";
import { getBrowserApi } from "../../shared/browser-api";

export type CaptionFile = {
  cues: Cue[];
  // When the page got it (performance.now() time), to tell it from an
  // earlier video's.
  at: number;
};

const FETCHED_TYPES = new Set(["fetch", "xmlhttprequest", "track", "other"]);
// Files fetched again at a time, newest first.
const MAX_FETCHED_AGAIN = 4;

type Listener = (file: CaptionFile) => void;

let latest: CaptionFile | undefined;
const listeners = new Set<Listener>();
let listening = false;
let watching = false;
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

// Takes what the observer passes on from now on; once per frame.
export function listenForCaptionFiles() {
  if (listening) return;
  listening = true;
  document.addEventListener(CAPTION_FILE_EVENT, (received) => {
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
}

// `listener` gets the newest file now (if any) and every newer one. The
// first call in a frame puts the observer in the page (where it isn't yet)
// and looks for files loaded before.
export function watchCaptionFiles(listener: Listener) {
  listenForCaptionFiles();
  listeners.add(listener);
  if (latest) listener(latest);
  if (!watching) {
    watching = true;
    void getBrowserApi()
      .runtime.sendMessage({ type: VIDEO_SUBTITLES_MESSAGE.observe })
      .catch(() => undefined);
    new PerformanceObserver((list) =>
      fetchAgain(list.getEntries() as PerformanceResourceTiming[]),
    ).observe({ type: "resource", buffered: true });
  }
  return () => listeners.delete(listener);
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
