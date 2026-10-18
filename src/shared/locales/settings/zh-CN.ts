import type { SettingsMessages } from "./en-US";

export const settingsZhCN: SettingsMessages = {
  providersModels: "AI 提供商和模型",
  agentsSkills: "智能体和技能",
  onPages: "网页功能",
  advanced: "高级",
  translate: "翻译",
  rightClick: "右键菜单",
  troubleshooting: "故障排除",
  shortcuts: "键盘快捷键",
  shortcutsDescription:
    "OpenBrowserAgent 各项命令的快捷键。快捷键由浏览器管理，请在浏览器的快捷键设置中修改。",
  shortcutNone: "未设置",
  changeShortcuts: "修改快捷键",
  shortcutsFirefoxHint:
    "如需修改，请打开 about:addons，点击齿轮按钮并选择“管理扩展快捷键”。",
  openMenuCommand: "打开菜单",
  openSidePanelCommand: "打开侧边栏",
  smartBarCommand: "为选中的文本显示智能工具栏",
  translatePageCommand: "翻译此页面或显示原文",
  sidePanelShortcutHint: "请在浏览器的快捷键设置中选择按键，例如 {keys}。",
  // One command's keys, with a button to change them.
  commandShortcut: {
    // {shortcut}: the keys, as the browser shows them.
    current: "快捷键：{shortcut}",
    none: "未设置快捷键",
    change: "更改快捷键",
  },
  chatBehavior: "对话行为",
  chatBehaviorDescription: "侧边栏中的滚动、重试、工具步数和节日彩蛋。",
  models: "模型",
  modelsDescription: "每项功能使用的模型。除非另行选择，否则都使用对话模型。",
  modelChat: "对话",
  modelHelper: "辅助",
  modelSmartBar: "智能工具栏",
  modelTranslation: "翻译",
  modelTranslationFallback: "内置翻译器无法翻译页面时使用。",
  modelTranslationUnavailable:
    "网页翻译目前使用 {engine}，而非 AI 模型。请在“网页翻译”设置中更改翻译引擎。",
  modelImages: "图片",
  translateMenuItems: "右键菜单项",
  translateMenuItemsDescription:
    "右键菜单中的翻译项。右键菜单本身在“右键菜单”中开启或关闭。",
};
