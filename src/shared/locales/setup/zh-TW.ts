import type { SetupMessages } from "./en-US";

export const setupZhTW: SetupMessages = {
  continueSetup: "繼續設定",
  runAgain: "重新執行設定精靈",
  progressLabel: "設定步驟",
  progressStep: "第 {current} 步，共 {total} 步：{step}",
  steps: {
    language: "語言",
    provider: "AI 提供者",
    pages: "網頁功能",
    done: "完成",
  },
  back: "上一步",
  next: "下一步",
  skipStep: "略過",
  languageTitle: "選擇語言",
  languageDescription:
    "擴充功能的介面語言，以及網頁翻譯成的語言。大多數人保留預設即可。",
  providerTitle: "連線 AI 提供者",
  providerDescription:
    "對話和智慧體需要一個 AI 提供者。選擇一項服務，或填寫任何 OpenAI 或 Anthropic 相容伺服器的 Base URL。",
  providerPlaceholder: "選擇 AI 提供者",
  providerReady: "{name} 已就緒。按「下一步」繼續。",
  testConnection: "測試連線",
  testingConnection: "正在測試…",
  connectionOk: "已連線，{model} 已回覆。",
  connectionFailed: "無法連線到 AI 提供者",
  modelFailed: "已連線，但 {model} 沒有回覆",
  noModelsListed: "已連線，但 AI 提供者沒有列出任何模型。請輸入模型名稱。",
  model: "模型",
  modelName: "模型名稱",
  modelNameHint: "如果 AI 提供者不列出模型，請輸入模型名稱，然後再次測試。",
  pagesTitle: "網頁功能",
  pagesDescription:
    "OpenBrowserAgent 在你造訪的網頁上加入的功能。之後可以在「設定 → 網頁功能」中變更。",
  translateButtonDescription: "網頁邊緣的小按鈕，可翻譯網頁或顯示原文。",
  smartBarTitle: "選取文字時顯示智慧工具列",
  smartBarDescription:
    "在選取的文字旁提供快速動作。選擇動作前不會傳送任何內容。",
  subtitlesDescription: "有字幕的影片會在每行字幕下方顯示譯文。",
  doneTitle: "設定完成",
  doneDescription:
    "開啟側邊欄，就目前頁面提問。這些快速鍵在任何頁面上都能使用。",
  noProviderNote:
    "對話需要 AI 提供者。使用內建翻譯器的網頁翻譯不需要 AI 提供者。",
  welcomeTitle: "歡迎使用 OpenBrowserAgent",
  openPanelDescription:
    "在瀏覽器的擴充功能選單中釘選 OpenBrowserAgent，然後點選它的圖示開啟側邊欄。",
  openPanel: "開啟側邊欄",
  joinLink: "已在另一台裝置上使用 OpenBrowserAgent？貼上同步碼",
  codeTab: "貼上同步碼",
  manualTab: "手動設定",
  code: "同步碼",
  codeDescription:
    "在另一台裝置的「設定 → 同步」中複製。同步碼中的同步選項會取代本裝置的選項。",
  codeInvalid: "這不是有效的同步碼。請重新複製並貼上完整的同步碼。",
  connect: "連線並同步",
  testing: "正在連線…",
  pulling: "正在同步…",
  failed: "無法連線。請檢查同步碼或伺服器資訊後再試一次。",
  connected: "已連線，設定正在同步。",
  keysLocked: "你的 API Key 已同步但處於鎖定狀態。請輸入同步密語。",
  unlock: "解鎖",
  skip: "暫時略過",
};
