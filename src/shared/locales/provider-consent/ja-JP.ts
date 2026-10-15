import type { ProviderConsentLocaleMessages } from "./en-US";

export const providerConsentJaJP: ProviderConsentLocaleMessages = {
  agreement:
    "チャットで共有する内容（メッセージ、ページのテキスト、スクリーンショット、ファイル）が {host} に送信されることに同意します。",
  promptTitle: "内容の送信を許可しますか？",
  allow: "同意する",
  decline: "今はしない",
  allowed: "内容の受信を許可済み",
  withdraw: "許可を取り消す",
  needsPermission: "許可が必要",
  localEndpoint: "ローカルのエンドポイント（{host}） — 許可は不要です。",
  requiredToSave:
    "API キーを保存するには、上のチェックボックスをオンにしてください。",
  required:
    "{host} はまだ内容の受信を許可されていません。サイドパネルでメッセージを送信するときか、「設定」→「AI プロバイダー」で同意してください。",
};
