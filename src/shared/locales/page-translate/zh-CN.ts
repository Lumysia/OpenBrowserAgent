import type { PageTranslateLocaleMessages } from "./en-US";

export const pageTranslateZhCN: PageTranslateLocaleMessages = {
  menu: {
    translatePage: "翻译此页面",
    showOriginal: "显示原文",
  },
  menuItemLabel: "翻译此页面 / 显示原文",
  settingsTitle: "网页翻译",
  settingsDescription:
    "在右键菜单中翻译整个页面：选择“翻译此页面”，选择“显示原文”即可恢复。",
  engine: "翻译引擎",
  engineDescription:
    "译文的来源。译文会保存在此设备上，翻译过的页面再次打开时会立即显示。",
  engines: {
    model: "AI 模型",
    browser: "内置翻译器（设备端）",
    google: "Google 翻译（免费）",
    microsoft: "Microsoft 翻译（免费）",
  },
  engineDetails: {
    model: "由你配置的 AI 提供商翻译，使用下方选择的模型。",
    browser: "由浏览器在此设备上翻译，文本不会离开设备。每种语言只需下载一次。",
    google: "非官方的免费服务，不是 Google 的 API，可能随时停止工作。",
    microsoft: "非官方的免费服务，不是 Microsoft 的 API，可能随时停止工作。",
  },
  cloudNotice: {
    google: "页面文本会发送给 Google 进行翻译。",
    microsoft: "页面文本会发送给 Microsoft 进行翻译。",
  },
  privacyLink: "隐私政策",
  model: "模型",
  modelDescription: "用于翻译页面的模型。",
  defaultModel: "对话所选的模型",
  targetLanguage: "翻译为",
  targetLanguageDescription: "页面会翻译成此语言。这不会改变扩展的语言。",
  followInterface: "扩展的语言（{language}）",
  display: "显示方式",
  displayDescription: "“原文和译文”会保留每个段落，并在其下方加上译文。",
  displayModes: {
    bilingual: "原文和译文",
    translation: "仅译文",
  },
  cache: "已保存的译文",
  cacheDescription:
    "译文会在此设备上保留 30 天，翻译过的页面再次打开时会立即显示。",
  clearCache: "清除已保存的译文",
  cacheCleared: "已清除保存的译文。",
  errors: {
    unavailable: "{engine}不可用。请在设置中检查网页翻译。",
    rateLimited:
      "{engine}正在限制来自此网络的请求。请稍后重试，或在设置中选择其他翻译引擎。",
    refused: "{engine}拒绝了翻译请求。请在设置中选择其他翻译引擎。",
    network: "无法连接到{engine}。请检查网络连接后重试。",
    failed: "{engine}未能翻译部分段落。",
  },
  noModel: "尚未设置 AI 模型。请在设置中添加提供商。",
  browserUnsupported: "内置翻译器无法将此页面翻译为{language}。",
  unavailablePage: "无法翻译此页面：浏览器不允许扩展修改它。",
};
