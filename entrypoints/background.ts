import { storage } from "../src/shared/storage";
import { handleDescribeRunMessage } from "../src/background/run-chat";
import { handleProviderTestMessage } from "../src/background/provider-test";
import { handleLocalExecutionBridgeRuntimeMessage } from "../src/background/local-execution-bridge-tools";
import { setupSync } from "../src/background/sync/scheduler";
import { setupMcpOriginRules } from "../src/shared/mcp-origin-rules";
import { handleChatStreamControlMessage } from "../src/background/stream-sessions";
import { connectStreamPort } from "../src/background/chat-stream-port";
import { openActionSurface } from "../src/background/action-surface";
import { setupContextMenu } from "../src/background/context-menu";
import {
  handlePageTranslateMessage,
  setupPageTranslate,
} from "../src/background/page-translate";
import {
  handleSmartBarMessage,
  setupSmartBar,
} from "../src/background/smart-bar";
import {
  handleVideoSubtitlesMessage,
  setupVideoSubtitles,
} from "../src/background/video-subtitles";

export default defineBackground(() => {
  chrome.sidePanel
    ?.setPanelBehavior?.({ openPanelOnActionClick: true })
    .catch(console.warn);

  const actionApi = chrome.action ?? chrome.browserAction;
  actionApi?.onClicked.addListener(() => {
    openActionSurface().catch(console.warn);
  });

  setupSmartBar();
  setupContextMenu();
  setupPageTranslate();
  setupVideoSubtitles();
  setupSync();
  setupMcpOriginRules();

  chrome.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === "update")
      storage.shouldShowUpdateToast.set(true).catch(console.warn);
  });

  chrome.runtime.onMessage.addListener(
    (message, sender, sendResponse) =>
      handleSmartBarMessage(message, sender, sendResponse) ||
      handlePageTranslateMessage(message, sender, sendResponse) ||
      handleVideoSubtitlesMessage(message, sender, sendResponse) ||
      handleChatStreamControlMessage(message, sendResponse) ||
      handleLocalExecutionBridgeRuntimeMessage(message, sendResponse) ||
      handleDescribeRunMessage(message, sendResponse) ||
      handleProviderTestMessage(message, sender, sendResponse),
  );

  chrome.runtime.onConnect.addListener(connectStreamPort);
});
