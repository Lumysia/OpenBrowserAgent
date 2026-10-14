import type { ContextMenuLocaleMessages } from "./en-US";

export const contextMenuZhCN: ContextMenuLocaleMessages = {
  items: {
    ask: "询问或操作此页面",
    summarizePage: "总结此页面",
    searchPage: "联网搜索此页面的相关信息",
    searchSelection: "联网搜索“%s”",
    summarizeLink: "总结链接页面",
    copyMarkdown: "复制为 Markdown",
  },
  searchSelectionRequest: "联网搜索所选文本的相关信息",
  copied: "已复制为 Markdown",
  copyFailed: "无法复制到剪贴板。请点击页面后重试。",
  copyUnavailable: "无法复制此页面：浏览器不允许扩展读取它。",
  settingsTitle: "右键菜单",
  settingsDescription: "右键点击页面时，菜单中显示的 OpenBrowserAgent 操作。",
  enable: "在右键菜单中显示",
  enableDescription:
    "右键点击页面、链接、图片或所选文本时，显示 OpenBrowserAgent 子菜单。",
  itemsTitle: "菜单项",
  itemsDescription:
    "打开侧边栏的操作会把页面交给智能体。“复制为 Markdown”不使用 AI。",
  itemLabels: {
    ask: "询问或操作此页面",
    summarizePage: "总结此页面",
    searchWeb: "联网搜索此页面或所选文本的相关信息",
    summarizeLink: "总结链接页面（在链接上）",
    copyMarkdown: "复制为 Markdown",
  },
};
