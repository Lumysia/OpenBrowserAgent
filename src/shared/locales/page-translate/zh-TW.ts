import type { PageTranslateLocaleMessages } from "./en-US";

export const pageTranslateZhTW: PageTranslateLocaleMessages = {
  menu: {
    translatePage: "翻譯此頁面",
    showOriginal: "顯示原文",
  },
  menuItemLabel: "翻譯此頁面 / 顯示原文",
  settingsTitle: "網頁翻譯",
  settingsDescription:
    "在右鍵選單中翻譯整個頁面：選擇「翻譯此頁面」，選擇「顯示原文」即可還原。",
  engine: "翻譯引擎",
  engineDescription:
    "譯文的來源。譯文會儲存在此裝置上，翻譯過的頁面再次開啟時會立即顯示。",
  engines: {
    model: "AI 模型",
    browser: "內建翻譯器（裝置端）",
    google: "Google 翻譯（免費）",
    microsoft: "Microsoft 翻譯（免費）",
  },
  engineDetails: {
    model: "由你設定的 AI 提供者翻譯，使用下方選擇的模型。",
    browser: "由瀏覽器在此裝置上翻譯，文字不會離開裝置。每種語言只需下載一次。",
    google: "非官方的免費服務，不是 Google 的 API，可能隨時停止運作。",
    microsoft: "非官方的免費服務，不是 Microsoft 的 API，可能隨時停止運作。",
  },
  cloudNotice: {
    google: "頁面文字會傳送給 Google 進行翻譯。",
    microsoft: "頁面文字會傳送給 Microsoft 進行翻譯。",
  },
  privacyLink: "隱私權政策",
  model: "模型",
  modelDescription: "用於翻譯頁面的模型。",
  defaultModel: "對話所選的模型",
  targetLanguage: "翻譯為",
  targetLanguageDescription: "頁面會翻譯成此語言。這不會改變擴充功能的語言。",
  followInterface: "擴充功能的語言（{language}）",
  display: "顯示方式",
  displayDescription: "「原文和譯文」會保留每個段落，並在其下方加上譯文。",
  displayModes: {
    bilingual: "原文和譯文",
    translation: "僅譯文",
  },
  cache: "已儲存的譯文",
  cacheDescription:
    "譯文會在此裝置上保留 30 天，翻譯過的頁面再次開啟時會立即顯示。",
  clearCache: "清除已儲存的譯文",
  cacheCleared: "已清除儲存的譯文。",
  errors: {
    unavailable: "{engine}無法使用。請在設定中檢查網頁翻譯。",
    rateLimited:
      "{engine}正在限制來自此網路的請求。請稍後再試，或在設定中選擇其他翻譯引擎。",
    refused: "{engine}拒絕了翻譯請求。請在設定中選擇其他翻譯引擎。",
    network: "無法連線到{engine}。請檢查網路連線後再試。",
    failed: "{engine}未能翻譯部分段落。",
  },
  noModel: "尚未設定 AI 模型。請在設定中新增提供者。",
  browserUnsupported: "內建翻譯器無法將此頁面翻譯為{language}。",
  unavailablePage: "無法翻譯此頁面：瀏覽器不允許擴充功能修改它。",
};
