import type { PageTranslateLocaleMessages } from "./en-US";

export const pageTranslateZhCN: PageTranslateLocaleMessages = {
  menu: {
    translatePage: "翻译此页面",
    showOriginal: "显示原文",
  },
  menuItemLabel: "翻译此页面 / 显示原文",
  settingsTitle: "网页翻译",
  settingsDescription:
    "在右键菜单中选择“翻译此页面”即可翻译，选择“显示原文”即可恢复。",
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
};
