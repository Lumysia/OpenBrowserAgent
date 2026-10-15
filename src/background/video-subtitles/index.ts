import { getMessages } from "../../shared/i18n";
// Translated video subtitles: injects the subtitle script into the frame
// with the video when the user starts them (the video's button, the
// right-click menu, "Translate this page"), and installs the caption file
// observer it asks for (see main-world.ts).
import { normalizePageTranslateSettings } from "../../shared/page-translate/settings";
import { getBrowserApi } from "../../shared/browser-api";
import { storage } from "../../shared/storage";
import {
  CAPTION_RESPONSE_MAX_CHARS,
  MIN_VIDEO_SIZE,
  VIDEO_SUBTITLES_MESSAGE,
  VIDEO_SUBTITLES_SCRIPT,
  type VideoButtonConfig,
  type VideoSubtitlesNotes,
  type VideoSubtitlesObserveMessage,
  type VideoSubtitlesStartAllMessage,
  type VideoSubtitlesStopAllMessage,
  type VideoSubtitlesToggleMessage,
} from "../../shared/video-subtitles/protocol";
import { showPageNote } from "../page-feedback";
import { pageToastTheme } from "../page-toast";
import { PAGE_TRANSLATE_TOAST_MS } from "../../shared/page-translate/protocol";
import { observeCaptionFiles } from "./main-world";
import { syncVideoButtonRegistration } from "./registration";

type Sender = chrome.runtime.MessageSender;

export function setupVideoSubtitles() {
  let registration = Promise.resolve();
  const sync = (on: boolean) => {
    registration = registration
      .then(() => syncVideoButtonRegistration(on))
      .catch((error) =>
        console.warn("Video button registration failed", error),
      );
  };
  void storage.preferences
    .get()
    .then((preferences) =>
      sync(
        normalizePageTranslateSettings(preferences.pageTranslate).videoButton,
      ),
    );
  storage.preferences.watch((preferences) =>
    sync(normalizePageTranslateSettings(preferences.pageTranslate).videoButton),
  );
}

// Subtitle page messages; false for other messages.
export function handleVideoSubtitlesMessage(
  message: unknown,
  sender: Sender,
  sendResponse: (response: unknown) => void,
) {
  const type = (message as { type?: unknown } | undefined)?.type;
  const tabId = sender.tab?.id;
  const frameId = sender.frameId ?? 0;
  switch (type) {
    case VIDEO_SUBTITLES_MESSAGE.button:
      if (tabId !== undefined)
        void toggleInFrame(tabId, frameId).finally(() =>
          sendResponse({ ok: true }),
        );
      else sendResponse({ ok: false });
      return true;
    case VIDEO_SUBTITLES_MESSAGE.config:
      void buttonConfig().then(sendResponse);
      return true;
    case VIDEO_SUBTITLES_MESSAGE.observe: {
      const event = (message as Partial<VideoSubtitlesObserveMessage>).event;
      if (tabId === undefined || typeof event !== "string") {
        sendResponse({ ok: false });
        return false;
      }
      void getBrowserApi()
        .scripting.executeScript({
          target: { tabId, frameIds: [frameId] },
          world: "MAIN",
          func: observeCaptionFiles,
          args: [event, CAPTION_RESPONSE_MAX_CHARS],
        })
        .then(
          () => sendResponse({ ok: true }),
          () => sendResponse({ ok: false }),
        );
      return true;
    }
    default:
      return false;
  }
}

// "Translate subtitles" in the right-click menu on a video.
export async function toggleVideoSubtitles(
  tab: chrome.tabs.Tab | undefined,
  frameId: number,
  srcUrl?: string,
) {
  if (tab?.id === undefined) return;
  await toggleInFrame(tab.id, frameId, srcUrl);
}

async function toggleInFrame(tabId: number, frameId: number, srcUrl?: string) {
  const notes = await pageNotes();
  const message: VideoSubtitlesToggleMessage = {
    type: VIDEO_SUBTITLES_MESSAGE.toggle,
    notes,
    ...(srcUrl && { srcUrl }),
  };
  const reply = (await injectScript(tabId, frameId))
    ? await sendToFrame(tabId, frameId, message)
    : undefined;
  if (reply?.ok) return;
  const messages = getMessages(await storage.language.get()).pageTranslate;
  await showPageNote(tabId, messages.subtitles.noVideo, notes.theme, {
    tone: "error",
    durationMs: PAGE_TRANSLATE_TOAST_MS,
  });
}

// "Translate this page" also translates the subtitles of the page's
// videos, in every frame that has one.
export async function startVideoSubtitles(tabId: number) {
  const { scripting } = getBrowserApi();
  const results = await scripting
    .executeScript({
      target: { tabId, allFrames: true },
      func: hasWatchableVideo,
      args: [MIN_VIDEO_SIZE.width, MIN_VIDEO_SIZE.height],
    })
    .catch(() => []);
  const frames = results.filter((result) => result.result === true);
  if (!frames.length) return;
  const message: VideoSubtitlesStartAllMessage = {
    type: VIDEO_SUBTITLES_MESSAGE.startAll,
    notes: await pageNotes(),
  };
  await Promise.all(
    frames.map(async ({ frameId }) => {
      if (await injectScript(tabId, frameId))
        await sendToFrame(tabId, frameId, message);
    }),
  );
}

// "Show original" stops them again, where the script is.
export async function stopVideoSubtitles(tabId: number) {
  const message: VideoSubtitlesStopAllMessage = {
    type: VIDEO_SUBTITLES_MESSAGE.stopAll,
  };
  await getBrowserApi()
    .tabs.sendMessage(tabId, message)
    .catch(() => undefined);
}

// Runs in each frame (serialized, so self-contained).
function hasWatchableVideo(width: number, height: number) {
  return [...document.getElementsByTagName("video")].some((video) => {
    const rect = video.getBoundingClientRect();
    return rect.width >= width && rect.height >= height;
  });
}

// The script guards against running twice in a frame.
function injectScript(tabId: number, frameId: number) {
  return getBrowserApi()
    .scripting.executeScript({
      target: { tabId, frameIds: [frameId] },
      files: [VIDEO_SUBTITLES_SCRIPT.main],
    })
    .then(
      () => true,
      () => false,
    );
}

function sendToFrame(tabId: number, frameId: number, message: unknown) {
  return getBrowserApi()
    .tabs.sendMessage(tabId, message, { frameId })
    .then(
      (reply: unknown) => reply as { ok?: boolean } | undefined,
      () => undefined,
    );
}

async function pageNotes(): Promise<VideoSubtitlesNotes> {
  const [preferences, language] = await Promise.all([
    storage.preferences.get(),
    storage.language.get(),
  ]);
  return {
    noCaptions: getMessages(language).pageTranslate.subtitles.noCaptions,
    liveOnly: getMessages(language).pageTranslate.subtitles.liveOnly,
    theme: pageToastTheme(preferences.colorScheme, preferences.accentColor),
  };
}

async function buttonConfig() {
  const [preferences, language] = await Promise.all([
    storage.preferences.get(),
    storage.language.get(),
  ]);
  const { start, stop } = getMessages(language).pageTranslate.subtitles;
  const config: VideoButtonConfig = {
    enabled: normalizePageTranslateSettings(preferences.pageTranslate)
      .videoButton,
    labels: { start, stop },
    theme: pageToastTheme(preferences.colorScheme, preferences.accentColor),
  };
  return config;
}
