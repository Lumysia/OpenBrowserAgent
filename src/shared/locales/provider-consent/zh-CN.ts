import type { ProviderConsentLocaleMessages } from "./en-US";

export const providerConsentZhCN: ProviderConsentLocaleMessages = {
  agreement:
    "我同意将我在对话中分享的内容（消息、网页文本、截图和文件）发送至 {host}。",
  promptTitle: "允许发送你的内容？",
  allow: "同意",
  decline: "暂不",
  allowed: "已允许接收你的内容",
  withdraw: "撤回许可",
  needsPermission: "需要你的许可",
  localEndpoint: "本地端点（{host}）——无需许可。",
  requiredToSave: "勾选上方的选项后才会保存 API Key。",
  required:
    "{host} 尚未获准接收你的内容。请在侧边栏发送消息时同意，或在“设置”→“AI 提供商”中同意。",
};
