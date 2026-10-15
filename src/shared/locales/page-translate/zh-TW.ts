import type { PageTranslateLocaleMessages } from "./en-US";

export const pageTranslateZhTW: PageTranslateLocaleMessages = {
  menu: {
    translatePage: "翻譯此頁面",
    showOriginal: "顯示原文",
  },
  menuItemLabel: "翻譯此頁面 / 顯示原文",
  settingsTitle: "網頁翻譯",
  settingsDescription:
    "使用網頁邊緣的按鈕、鍵盤快速鍵或右鍵選單中的「翻譯此頁面」即可翻譯，再操作一次即可顯示原文。",
  engine: "翻譯引擎",
  engineDescription: "選擇用什麼翻譯頁面。",
  engines: {
    model: "AI 模型",
    browser: "內建翻譯器（裝置端）",
    google: "Google 翻譯（免費）",
    microsoft: "Microsoft 翻譯（免費）",
  },
  engineDetails: {
    model: "由你的 AI 提供者使用下方選擇的模型翻譯頁面。",
    browser:
      "由瀏覽器在此裝置上翻譯，文字不會離開裝置。每種語言只需下載一次。無法翻譯的頁面會改由下方的 AI 模型翻譯。",
    google: "非官方的免費服務，不是 Google 的 API，可能隨時停止運作。",
    microsoft: "非官方的免費服務，不是 Microsoft 的 API，可能隨時停止運作。",
  },
  cloudNotice: {
    google:
      "頁面文字會傳送給 Google 進行翻譯。如果 Google 在某個頁面上出錯，該頁面的其餘部分會改由 Microsoft 翻譯。",
    microsoft:
      "頁面文字會傳送給 Microsoft 進行翻譯。如果 Microsoft 在某個頁面上出錯，該頁面的其餘部分會改由 Google 翻譯。",
  },
  engineNames: {
    model: "AI 模型",
    browser: "內建翻譯器",
    google: "Google",
    microsoft: "Microsoft",
  },
  privacyLink: "隱私權政策",
  model: "模型",
  modelDescription: "用於翻譯頁面的模型。",
  defaultModel: "與對話相同的模型",
  targetLanguage: "翻譯為",
  targetLanguageDescription: "頁面會翻譯成此語言。這不會改變擴充功能的語言。",
  followInterface: "擴充功能的語言（{language}）",
  display: "顯示方式",
  displayDescription: "「原文和譯文」會保留每個段落，並在其下方加上譯文。",
  displayModes: {
    bilingual: "原文和譯文",
    translation: "僅譯文",
  },
  translateMenus: "同時翻譯選單和按鈕",
  translateMenusDescription:
    "關閉時，導覽、選單、按鈕、分頁和頁尾中的簡短標籤保持不變；其中的標題、句子和問題仍會翻譯。",
  cache: "已儲存的譯文",
  cacheDescription:
    "譯文會在此裝置上保留 30 天，翻譯過的頁面再次開啟時會立即顯示。",
  clearCache: "清除已儲存的譯文",
  cacheCleared: "已清除儲存的譯文。",
  clearCacheFailed: "無法清除已儲存的譯文",
  errors: {
    unavailable: "{engine}無法使用。請在設定中檢查網頁翻譯。",
    rateLimited:
      "{engine}正在限制來自此網路的請求。請稍後再試，或在設定中選擇其他翻譯引擎。",
    refused: "{engine}拒絕了翻譯請求。請在設定中選擇其他翻譯引擎。",
    network: "無法連線到{engine}。請檢查網路連線後再試。",
    failed: "{engine}未能翻譯部分段落。",
    allFailed:
      "{engine} 和 {fallback} 都無法翻譯。請稍後再試，或在設定中選擇其他翻譯引擎。",
  },
  switched: {
    rateLimited: "{engine} 正在限制請求，此頁面已改用 {fallback} 翻譯。",
    failed: "{engine} 暫時無法使用，此頁面已改用 {fallback} 翻譯。",
    unavailable: "{engine}無法在此翻譯這個頁面，已改用 {fallback}。",
  },
  browserMissing: "此瀏覽器沒有內建翻譯器，頁面會由下方的 AI 模型翻譯。",
  notStarted: "無法開始翻譯此頁面。請重新載入頁面後再試。",
  unavailablePage: "無法翻譯此頁面：瀏覽器不允許擴充功能修改它。",
  button: {
    translating: "正在翻譯…",
    hide: "隱藏翻譯按鈕",
    hideOnSite: "在 {site} 上隱藏",
    hideEverywhere: "在所有網站上隱藏",
    setting: "網頁上的翻譯按鈕",
    settingDescription:
      "在網頁邊緣顯示一個小按鈕，用來翻譯此頁面或顯示原文。拖曳即可移動，放開後會停靠在視窗最近的邊緣。",
    move: "方向鍵沿邊緣移動，E 鍵將它移到下一個邊緣。",
    hiddenSites: "在這些網站上隱藏",
    hiddenSitesDescription: "按鈕不會在這些網站上顯示。網站包含其子網域。",
  },
  shortcut: {
    setting: "鍵盤快速鍵",
    settingDescription: "翻譯此頁面或顯示原文。",
    current: "快速鍵：{shortcut}",
    none: "尚未設定快速鍵",
    change: "變更快速鍵",
    firefoxHint:
      "如要變更，請開啟 about:addons，點選齒輪按鈕，再選擇「管理擴充套件快速鍵」。",
  },
  subtitles: {
    menu: "翻譯字幕",
    menuItemLabel: "翻譯字幕 / 隱藏譯文（影片上）",
    noCaptions:
      "尚未找到此影片的字幕。請在播放器中開啟字幕，字幕一出現就會翻譯。",
    liveOnly:
      "正在邊播邊翻螢幕上的字幕。想提前翻好，請在播放器裡把字幕關掉再開啟。",
    noVideo: "這裡沒有可翻譯字幕的影片。",
    // Settings: subtitles start by themselves on every video.
    setting: "翻譯影片字幕",
    settingDescription:
      "有字幕的影片會自動在每行字幕下顯示譯文，適用於所有網站。在影片的右鍵選單中選擇「翻譯字幕」可為該影片關閉或重新開啟。此項關閉時，仍可透過選單和「翻譯此頁面」翻譯字幕。",
  },
};
