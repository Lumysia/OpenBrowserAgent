import type { PageTranslateLocaleMessages } from "./en-US";

export const pageTranslateZhCN: PageTranslateLocaleMessages = {
  menu: {
    translatePage: "翻译此页面",
    showOriginal: "显示原文",
  },
  menuItemLabel: "翻译此页面 / 显示原文",
  settingsTitle: "网页翻译",
  settingsDescription:
    "使用网页边缘的按钮、键盘快捷键或右键菜单中的“翻译此页面”即可翻译，再操作一次即可显示原文。",
  engine: "翻译引擎",
  engineDescription: "选择用什么翻译页面。",
  engines: {
    model: "AI 模型",
    browser: "内置翻译器（设备端）",
    google: "Google 翻译（免费）",
    microsoft: "Microsoft 翻译（免费）",
  },
  engineDetails: {
    model: "由你的 AI 提供商使用下方选择的模型翻译页面。",
    browser:
      "由浏览器在此设备上翻译，文本不会离开设备。每种语言只需下载一次。无法翻译的页面将改由下方的 AI 模型翻译。",
    google: "非官方的免费服务，不是 Google 的 API，可能随时停止工作。",
    microsoft: "非官方的免费服务，不是 Microsoft 的 API，可能随时停止工作。",
  },
  cloudNotice: {
    google:
      "页面文本会发送给 Google 进行翻译。如果 Google 在某个页面上出错，该页面的其余部分会改由 Microsoft 翻译。",
    microsoft:
      "页面文本会发送给 Microsoft 进行翻译。如果 Microsoft 在某个页面上出错，该页面的其余部分会改由 Google 翻译。",
  },
  engineNames: {
    model: "AI 模型",
    browser: "内置翻译器",
    google: "Google",
    microsoft: "Microsoft",
  },
  privacyLink: "隐私政策",
  model: "模型",
  modelDescription: "用于翻译页面的模型。",
  defaultModel: "与对话相同的模型",
  targetLanguage: "翻译为",
  targetLanguageDescription: "页面会翻译成此语言。这不会改变扩展的语言。",
  followInterface: "扩展的语言（{language}）",
  display: "显示方式",
  displayDescription: "“原文和译文”会保留每个段落，并在其下方加上译文。",
  displayModes: {
    bilingual: "原文和译文",
    translation: "仅译文",
  },
  translateMenus: "同时翻译菜单和按钮",
  translateMenusDescription:
    "关闭时只翻译页面的正文，导航、菜单、按钮、标签页和页脚保持不变。",
  cache: "已保存的译文",
  cacheDescription:
    "译文会在此设备上保留 30 天，翻译过的页面再次打开时会立即显示。",
  clearCache: "清除已保存的译文",
  cacheCleared: "已清除保存的译文。",
  clearCacheFailed: "无法清除已保存的译文",
  errors: {
    unavailable: "{engine}不可用。请在设置中检查网页翻译。",
    rateLimited:
      "{engine}正在限制来自此网络的请求。请稍后重试，或在设置中选择其他翻译引擎。",
    refused: "{engine}拒绝了翻译请求。请在设置中选择其他翻译引擎。",
    network: "无法连接到{engine}。请检查网络连接后重试。",
    failed: "{engine}未能翻译部分段落。",
    allFailed:
      "{engine} 和 {fallback} 都无法翻译。请稍后重试，或在设置中选择其他翻译引擎。",
  },
  switched: {
    rateLimited: "{engine} 正在限制请求，此页面已改用 {fallback} 翻译。",
    failed: "{engine} 暂时无法使用，此页面已改用 {fallback} 翻译。",
    unavailable: "{engine}无法在此翻译这个页面，已改用 {fallback}。",
  },
  browserMissing: "此浏览器没有内置翻译器，页面将由下方的 AI 模型翻译。",
  notStarted: "无法开始翻译此页面。请重新加载页面后重试。",
  unavailablePage: "无法翻译此页面：浏览器不允许扩展修改它。",
  button: {
    translating: "正在翻译…",
    hide: "隐藏翻译按钮",
    hideOnSite: "在 {site} 上隐藏",
    hideEverywhere: "在所有网站上隐藏",
    setting: "网页上的翻译按钮",
    settingDescription:
      "在网页边缘显示一个小按钮，用来翻译此页面或显示原文。拖动即可移动它，松开后它会停靠在窗口最近的边缘。",
    move: "方向键沿边缘移动它，E 键将它移到下一条边缘。",
    hiddenSites: "在这些网站上隐藏",
    hiddenSitesDescription: "按钮不会在这些网站上显示。网站包括其子域名。",
  },
  shortcut: {
    setting: "键盘快捷键",
    settingDescription: "翻译此页面或显示原文。",
    current: "快捷键：{shortcut}",
    none: "未设置快捷键",
    change: "更改快捷键",
    firefoxHint:
      "如需更改，请打开 about:addons，点击齿轮按钮，然后选择“管理扩展快捷键”。",
  },
  subtitles: {
    menu: "翻译字幕",
    menuItemLabel: "翻译字幕 / 隐藏译文（视频上）",
    start: "翻译字幕",
    stop: "隐藏字幕译文",
    noCaptions:
      "暂未找到此视频的字幕。请在播放器中打开字幕，字幕一出现就会翻译。",
    liveOnly:
      "正在边播边翻屏幕上的字幕。想提前翻好，请在播放器里把字幕关掉再打开。",
    noVideo: "这里没有可翻译字幕的视频。",
    videoButton: "视频上的字幕按钮",
    videoButtonDescription:
      "指向视频时在其角落显示一个按钮，用于翻译字幕。“翻译此页面”也会翻译页面上视频的字幕。",
  },
};
