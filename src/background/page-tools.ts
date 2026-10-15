// The page tools of a tab (see shared/page-tools.ts): their state, read
// fresh each time, and the changes the toolbar button's menu and the side
// panel's strip make.
import { getBrowserApi } from "../shared/browser-api";
import {
  applyPageToolSetting,
  PAGE_TOOLS_MESSAGE,
  pageToolsState,
  type PageToolChange,
  type PageToolsChangeMessage,
  type PageToolsState,
  type PageToolsStateMessage,
} from "../shared/page-tools";
import { respondWith, type RuntimeReply } from "../shared/runtime-messages";
import { pageHost } from "../shared/site-hosts";
import { storage } from "../shared/storage";
import {
  MIN_VIDEO_SIZE,
  VIDEO_SUBTITLES_ACTIVE_KEY,
  VIDEO_SUBTITLES_MESSAGE,
} from "../shared/video-subtitles/protocol";
import { togglePageTranslation } from "./page-translate";
import { isTabTranslated } from "./page-translate/tab-state";
import { onPageToolsChanged, pageToolsChanged } from "./page-tools-events";
import { startVideoSubtitles, stopVideoSubtitles } from "./video-subtitles";

type Sender = chrome.runtime.MessageSender;

// Extension pages (the side panel) hear when to read the state again: on
// the background's own changes, on settings changes and when the user
// moves to another tab or page.
export function setupPageTools() {
  const api = getBrowserApi();
  const announce = () =>
    void api.runtime
      .sendMessage({ type: PAGE_TOOLS_MESSAGE.changed })
      .catch(() => undefined);
  onPageToolsChanged(announce);
  api.tabs.onActivated.addListener(() => pageToolsChanged());
  api.windows?.onFocusChanged.addListener(() => pageToolsChanged());
  api.tabs.onUpdated.addListener((_tabId, change, tab) => {
    if (
      tab.active &&
      (change.status === "complete" || change.url !== undefined)
    )
      pageToolsChanged();
  });
  storage.preferences.watch(() => pageToolsChanged());
  storage.language.watch(() => pageToolsChanged());
}

// Page tools messages from the side panel, and the subtitle script's state
// message; false for other messages.
export function handlePageToolsMessage(
  message: unknown,
  sender: Sender,
  sendResponse: (reply: RuntimeReply) => void,
) {
  const type = (message as { type?: unknown } | undefined)?.type;
  if (type === VIDEO_SUBTITLES_MESSAGE.state) {
    pageToolsChanged();
    return false;
  }
  if (sender.tab) return false;
  if (type === PAGE_TOOLS_MESSAGE.state) {
    const { tabId } = message as PageToolsStateMessage;
    return respondWith(tabPageTools(tabId), sendResponse);
  }
  if (type === PAGE_TOOLS_MESSAGE.change) {
    const { tabId, change } = message as PageToolsChangeMessage;
    return respondWith(
      getBrowserApi()
        .tabs.get(tabId)
        .then((tab) => changePageTool(tab, change))
        .then(() => tabPageTools(tabId)),
      sendResponse,
    );
  }
  return false;
}

export async function tabPageTools(
  tab: chrome.tabs.Tab | number | undefined,
): Promise<PageToolsState> {
  const api = getBrowserApi();
  const resolved =
    typeof tab === "number"
      ? await api.tabs.get(tab).catch(() => undefined)
      : tab;
  const host = pageHost(resolved?.url);
  const tabId = resolved?.id;
  const [preferences, uiLanguage, translated, videos] = await Promise.all([
    storage.preferences.get(),
    storage.language.get(),
    isTabTranslated(tabId),
    host && tabId !== undefined ? probeVideos(tabId) : undefined,
  ]);
  return pageToolsState({
    host,
    preferences,
    uiLanguage,
    translated,
    video: !!videos?.video,
    subtitles: !!videos?.subtitles,
  });
}

export async function activeTab() {
  const [tab] = await getBrowserApi()
    .tabs.query({ active: true, lastFocusedWindow: true })
    .catch(() => []);
  return tab as chrome.tabs.Tab | undefined;
}

export async function changePageTool(
  tab: chrome.tabs.Tab | undefined,
  change: PageToolChange,
) {
  if (tab?.id === undefined) return;
  switch (change.tool) {
    case "translate":
      return togglePageTranslation(tab);
    case "subtitles":
      await (change.on
        ? startVideoSubtitles(tab.id)
        : stopVideoSubtitles(tab.id));
      return;
    default: {
      const host = pageHost(tab.url);
      await storage.preferences.update(
        (preferences) =>
          applyPageToolSetting(preferences, host, change) ?? preferences,
      );
    }
  }
}

// Whether some frame of the tab has a video at a usable size, and whether
// one has translated subtitles. Nothing where the page can't be scripted.
async function probeVideos(tabId: number) {
  const results = await getBrowserApi()
    .scripting.executeScript({
      target: { tabId, allFrames: true },
      func: probeFrame,
      args: [
        MIN_VIDEO_SIZE.width,
        MIN_VIDEO_SIZE.height,
        VIDEO_SUBTITLES_ACTIVE_KEY,
      ],
    })
    .catch(() => []);
  return {
    video: results.some((result) => result.result?.video),
    subtitles: results.some((result) => result.result?.subtitles),
  };
}

// Runs in each frame, in the extension's isolated world (serialized, so
// self-contained).
function probeFrame(width: number, height: number, activeKey: string) {
  const video = [...document.getElementsByTagName("video")].some((item) => {
    const rect = item.getBoundingClientRect();
    return rect.width >= width && rect.height >= height;
  });
  const scope = globalThis as unknown as Record<symbol, boolean | undefined>;
  return { video, subtitles: scope[Symbol.for(activeKey)] === true };
}
