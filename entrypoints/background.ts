import { storage } from "../src/shared/storage";
import { runStorageMigrations } from "../src/shared/storage-migrations";
import { handleDescribeRunMessage } from "../src/background/run-chat";
import { handleProviderRequestMessage } from "../src/background/provider-requests";
import { handleLocalExecutionBridgeRuntimeMessage } from "../src/background/local-execution-bridge-tools";
import { setupSync } from "../src/background/sync/scheduler";
import { setupMcpOriginRules } from "../src/shared/mcp-origin-rules";
import { handleChatStreamControlMessage } from "../src/background/stream-sessions";
import { connectStreamPort } from "../src/background/chat-stream-port";
import { openActionSurface } from "../src/background/action-surface";
import { setupContextMenu } from "../src/background/context-menu";
import {
  handlePageToolsMessage,
  setupPageTools,
} from "../src/background/page-tools";
import {
  handlePageTranslateMessage,
  setupPageTranslate,
} from "../src/background/page-translate";
import {
  handlePageButtonMessage,
  registerPageButton,
} from "../src/background/page-translate/button";
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
  setupPageTools();
  setupContextMenu();
  setupPageTranslate();
  registerPageButton();
  setupVideoSubtitles();
  setupSync();
  setupMcpOriginRules();

  chrome.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === "update")
      storage.shouldShowUpdateToast.set(true).catch(console.warn);
    if (reason === "install" || reason === "update")
      runStorageMigrations(reason === "install").catch(console.warn);
  });

  chrome.runtime.onMessage.addListener(
    (message, sender, sendResponse) =>
      handleSmartBarMessage(message, sender, sendResponse) ||
      handlePageTranslateMessage(message, sender, sendResponse) ||
      handlePageButtonMessage(message, sender, sendResponse) ||
      handleVideoSubtitlesMessage(message, sender, sendResponse) ||
      handlePageToolsMessage(message, sender, sendResponse) ||
      handleChatStreamControlMessage(message, sendResponse) ||
      handleLocalExecutionBridgeRuntimeMessage(message, sendResponse) ||
      handleDescribeRunMessage(message, sendResponse) ||
      handleProviderRequestMessage(message, sender, sendResponse),
  );

  chrome.runtime.onConnect.addListener(connectStreamPort);
});
