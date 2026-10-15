// Translated subtitles for the videos in this frame. Injected by the
// background when the user starts them (the video's button, the right-click
// menu, or "Translate this page"); only those messages start or stop them,
// never the page.
import { getBrowserApi } from "../shared/browser-api";
import { claimPageScript } from "../shared/extension-context";
import {
  activeVideosChanged,
  VIDEO_SUBTITLES_MESSAGE,
  MIN_VIDEO_SIZE,
  videoSubtitlesShared,
  type VideoSubtitlesNotes,
  type VideoSubtitlesStartAllMessage,
  type VideoSubtitlesToggleMessage,
} from "../shared/video-subtitles/protocol";
import { createTranslator, type SubtitleTranslator } from "./translator";
import { startVideoSession, type VideoSession } from "./video-session";

const INSTALLED = Symbol.for("oba.videoSubtitles");

export function installVideoSubtitles() {
  const scope = globalThis as { [INSTALLED]?: boolean };
  if (scope[INSTALLED]) return;
  scope[INSTALLED] = true;

  const sessions = new Map<HTMLVideoElement, VideoSession>();
  let translator: SubtitleTranslator | undefined;
  videoSubtitlesShared().isActive = (video) => sessions.has(video);
  const changed = activeVideosChanged;

  function start(video: HTMLVideoElement, notes: VideoSubtitlesNotes) {
    if (sessions.has(video)) return;
    translator ??= createTranslator({
      onChange: () => sessions.forEach((session) => session.refresh()),
      onFatal: stopAll,
    });
    sessions.set(video, startVideoSession(video, translator, notes));
    changed();
  }

  function stop(video: HTMLVideoElement) {
    sessions.get(video)?.stop();
    sessions.delete(video);
    if (!sessions.size) {
      translator?.stop();
      translator = undefined;
    }
    changed();
  }

  function stopAll() {
    for (const video of [...sessions.keys()]) stop(video);
  }

  function toggle(message: VideoSubtitlesToggleMessage) {
    const video = pickVideo(message.srcUrl);
    if (!video) return false;
    if (sessions.has(video)) stop(video);
    else start(video, message.notes);
    return true;
  }

  claimPageScript("video-subtitles", stopAll);
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
        for (const video of videos) start(video, notes);
        sendResponse({ ok: videos.length > 0 });
      } else if (type === VIDEO_SUBTITLES_MESSAGE.stopAll) {
        stopAll();
        sendResponse({ ok: true });
      }
      return false;
    },
  );
  // A video taken out of the page takes its subtitles with it.
  setInterval(() => {
    for (const video of sessions.keys()) if (!video.isConnected) stop(video);
  }, REMOVED_CHECK_MS);
}

const REMOVED_CHECK_MS = 2_000;

// A video worth subtitles: shown at a usable size.
function isWatchable(video: HTMLVideoElement) {
  const rect = video.getBoundingClientRect();
  return (
    rect.width >= MIN_VIDEO_SIZE.width && rect.height >= MIN_VIDEO_SIZE.height
  );
}

// The video the user means: the right-clicked one (by its source, or the
// one the button script saw under the pointer), else the largest playing
// one, else the largest.
function pickVideo(srcUrl: string | undefined) {
  const videos = [...document.getElementsByTagName("video")];
  if (srcUrl) {
    const match = videos.find(
      (video) => video.currentSrc === srcUrl || video.src === srcUrl,
    );
    if (match) return match;
  }
  const pointed = videoSubtitlesShared().pointed?.deref();
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
