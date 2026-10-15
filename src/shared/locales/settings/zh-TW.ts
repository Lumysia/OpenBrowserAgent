import type { SettingsMessages } from "./en-US";

export const settingsZhTW: SettingsMessages = {
  providersModels: "AI 提供者和模型",
  agentsSkills: "智慧體和技能",
  onPages: "網頁功能",
  advanced: "進階",
  translate: "翻譯",
  rightClick: "右鍵選單",
  troubleshooting: "疑難排解",
  shortcuts: "鍵盤快速鍵",
  shortcutsDescription:
    "OpenBrowserAgent 各項指令的快速鍵。快速鍵由瀏覽器管理，請在瀏覽器的快速鍵設定中修改。",
  shortcutNone: "未設定",
  changeShortcuts: "修改快速鍵",
  shortcutsFirefoxHint:
    "如需修改，請開啟 about:addons，點選齒輪按鈕並選擇「管理擴充套件快速鍵」。",
  openSidePanelCommand: "開啟側邊欄",
  // One command's keys, with a button to change them.
  commandShortcut: {
    // {shortcut}: the keys, as the browser shows them.
    current: "快速鍵：{shortcut}",
    none: "尚未設定快速鍵",
    change: "變更快速鍵",
  },
  chatBehavior: "對話行為",
  chatBehaviorDescription: "側邊欄中的捲動、重試、工具步數和節日彩蛋。",
  models: "模型",
  modelsDescription: "每項功能使用的模型。除非另行選擇，否則都使用對話模型。",
  modelChat: "對話",
  modelHelper: "輔助",
  modelSmartBar: "智慧工具列",
  modelTranslation: "翻譯",
  modelImages: "圖片",
  translateMenuItems: "右鍵選單項目",
  translateMenuItemsDescription:
    "右鍵選單中的翻譯項目。右鍵選單本身在「右鍵選單」中開啟或關閉。",
};
