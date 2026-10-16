// Translated subtitles for the videos in this frame. Registered before the
// page's scripts on every page while "Translate video subtitles automatically" is on: then
// every video that shows at a usable size gets them by itself, and shows
// nothing until the page gives it captions (its text tracks or a caption
// file). Else injected by the background when the user starts them (the
// right-click menu, or "Translate this page"). Only the extension's
// messages and the user's own clicks start or stop them, never the page.
import { getBrowserApi } from "../shared/browser-api";
import {
  claimPageScript,
  isExtensionContextValid,
} from "../shared/extension-context";
import { STORAGE_KEYS } from "../shared/storage-keys";
import {
  MIN_VIDEO_SIZE,
  VIDEO_SUBTITLES_ACTIVE_KEY,
  VIDEO_SUBTITLES_MESSAGE,
  type VideoSubtitlesConfig,
  type VideoSubtitlesNotes,
  type VideoSubtitlesStartAllMessage,
  type VideoSubtitlesToggleMessage,
} from "../shared/video-subtitles/protocol";
import { listenForCaptionFiles } from "./sources/caption-files";
import { createTranslator, type SubtitleTranslator } from "./translator";
import { startVideoSession, type VideoSession } from "./video-session";

const INSTALLED = Symbol.for("oba.videoSubtitles");
const ACTIVE = Symbol.for(VIDEO_SUBTITLES_ACTIVE_KEY);
// Media events (seen on the document while capturing) that tell a video is
// there or has changed size.
const VIDEO_EVENTS = ["loadedmetadata", "play", "playing", "resize"];
const REMOVED_CHECK_MS = 2_000;

// Who started a video's subtitles: "Show original" leaves the ones that
// started by themselves, and only the ones the user started read captions
// drawn as page text.
type Origin = "always" | "page" | "menu";
type Started = { session: VideoSession; origin: Origin };

// Subtitles that started by themselves and found nothing yet: the user
// starting them reads the page's text too, instead of turning them off.
function isWaiting(started: Started | undefined) {
  return started?.origin === "always" && !started.session.found;
}

export function installVideoSubtitles() {
  const scope = globalThis as { [INSTALLED]?: boolean };
  if (scope[INSTALLED]) return;
  scope[INSTALLED] = true;

  const sessions = new Map<HTMLVideoElement, Started>();
  // Videos the user turned off from the menu: they stay off for this page
  // load.
  const declined = new WeakSet<HTMLVideoElement>();
  // Videos a note was shown for: at most one each.
  const noted = new WeakSet<HTMLVideoElement>();
  let translator: SubtitleTranslator | undefined;
  let always: Promise<boolean> | undefined;
  // No engine to translate with: nothing starts by itself again.
  let halted = false;
  let pointed: WeakRef<HTMLVideoElement> | undefined;
  let removedTimer: number | undefined;

  // Tells the background when the frame's first subtitles start or its
  // last ones stop.
  function announce() {
    const scope = globalThis as { [ACTIVE]?: boolean };
    const active = sessions.size > 0;
    if (!!scope[ACTIVE] === active) return;
    scope[ACTIVE] = active;
    void send({ type: VIDEO_SUBTITLES_MESSAGE.state });
  }

  function start(
    video: HTMLVideoElement,
    origin: Origin,
    notes?: VideoSubtitlesNotes,
  ) {
    const started = sessions.get(video);
    if (started && (origin === "always" || !isWaiting(started))) return;
    started?.session.stop();
    translator ??= createTranslator({
      onChange: () => sessions.forEach(({ session }) => session.refresh()),
      onFatal: () => {
        halted = true;
        stopAll();
      },
    });
    const note = notes && !noted.has(video) ? notes : undefined;
    if (note) noted.add(video);
    sessions.set(video, {
      session: startVideoSession(video, translator, {
        notes: note,
        pageText: origin !== "always",
      }),
      origin,
    });
    announce();
    removedTimer ??= window.setInterval(() => {
      for (const video of sessions.keys()) if (!video.isConnected) stop(video);
    }, REMOVED_CHECK_MS);
  }

  function stop(video: HTMLVideoElement) {
    sessions.get(video)?.session.stop();
    sessions.delete(video);
    announce();
    if (sessions.size) return;
    translator?.stop();
    translator = undefined;
    clearInterval(removedTimer);
    removedTimer = undefined;
  }

  function stopAll(which: (origin: Origin) => boolean = () => true) {
    for (const [video, { origin }] of [...sessions])
      if (which(origin)) stop(video);
  }

  function toggle(message: VideoSubtitlesToggleMessage) {
    const video = pickVideo(message.srcUrl, pointed?.deref());
    if (!video) return false;
    const started = sessions.get(video);
    if (started && !isWaiting(started)) {
      declined.add(video);
      stop(video);
    } else {
      declined.delete(video);
      start(video, "menu", message.notes);
    }
    return true;
  }

  // Whether subtitles start by themselves, asked once the frame has a
  // video, and again when the settings change.
  function config() {
    always ??= send<VideoSubtitlesConfig>({
      type: VIDEO_SUBTITLES_MESSAGE.config,
    }).then((reply) => reply?.always === true);
    return always;
  }

  // Starts the subtitles of `videos` that should have them by themselves.
  function startAlways(videos: Iterable<HTMLVideoElement>) {
    const wanted = [...videos].filter(
      (video) => !sessions.has(video) && !declined.has(video),
    );
    if (halted || !wanted.some(isWatchable)) return;
    void config().then((on) => {
      if (!on || halted) return;
      for (const video of wanted)
        if (video.isConnected && isWatchable(video)) start(video, "always");
    });
  }

  claimPageScript("video-subtitles", () => stopAll());
  listenForCaptionFiles();
  for (const type of VIDEO_EVENTS)
    document.addEventListener(
      type,
      (event) => {
        if (event.target instanceof HTMLVideoElement)
          startAlways([event.target]);
      },
      { capture: true, passive: true },
    );
  const scan = () => startAlways(document.getElementsByTagName("video"));
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", scan, { once: true });
  else scan();

  // The right-clicked video, for the menu's "Translate subtitles".
  document.addEventListener(
    "contextmenu",
    (event) => {
      if (!event.isTrusted) return;
      const video = videoAt(event.clientX, event.clientY);
      if (video) pointed = new WeakRef(video);
    },
    { capture: true, passive: true },
  );

  getBrowserApi().storage.onChanged.addListener((changes) => {
    if (!always || !changes[STORAGE_KEYS.preferences]) return;
    always = undefined;
    void config().then((on) => {
      if (on) scan();
      else stopAll((origin) => origin === "always");
    });
  });

  getBrowserApi().runtime.onMessage.addListener(
    (message, _sender, sendResponse) => {
      const type = (message as { type?: string } | undefined)?.type;
      if (type === VIDEO_SUBTITLES_MESSAGE.toggle)
        sendResponse({ ok: toggle(message as VideoSubtitlesToggleMessage) });
      else if (type === VIDEO_SUBTITLES_MESSAGE.startAll) {
        const videos = [...document.getElementsByTagName("video")].filter(
          isWatchable,
        );
        const { notes } = message as VideoSubtitlesStartAllMessage;
        for (const video of videos) start(video, "page", notes);
        sendResponse({ ok: videos.length > 0 });
      } else if (type === VIDEO_SUBTITLES_MESSAGE.stopAll) {
        stopAll((origin) => origin !== "always");
        sendResponse({ ok: true });
      }
      return false;
    },
  );
}

function send<T>(message: { type: string }) {
  if (!isExtensionContextValid()) return Promise.resolve(undefined);
  return getBrowserApi()
    .runtime.sendMessage(message)
    .then(
      (reply: unknown) => reply as T | undefined,
      () => undefined,
    );
}

// A video worth subtitles: shown at a usable size.
function isWatchable(video: HTMLVideoElement) {
  const rect = video.getBoundingClientRect();
  return (
    rect.width >= MIN_VIDEO_SIZE.width && rect.height >= MIN_VIDEO_SIZE.height
  );
}

function videoAt(x: number, y: number) {
  for (const video of document.getElementsByTagName("video")) {
    const rect = video.getBoundingClientRect();
    if (
      isWatchable(video) &&
      x >= rect.left &&
      x <= rect.right &&
      y >= rect.top &&
      y <= rect.bottom
    )
      return video;
  }
  return undefined;
}

// The video the user means: the right-clicked one (by its source, or the
// one under the pointer), else the largest playing one, else the largest.
function pickVideo(
  srcUrl: string | undefined,
  pointed: HTMLVideoElement | undefined,
) {
  const videos = [...document.getElementsByTagName("video")];
  if (srcUrl) {
    const match = videos.find(
      (video) => video.currentSrc === srcUrl || video.src === srcUrl,
    );
    if (match) return match;
  }
  if (pointed?.isConnected) return pointed;
  const area = (video: HTMLVideoElement) => {
    const rect = video.getBoundingClientRect();
    return rect.width * rect.height;
  };
  const watchable = videos
    .filter(isWatchable)
    .sort((a, b) => area(b) - area(a));
  return watchable.find((video) => !video.paused) ?? watchable[0];
}
