import type { PageTranslateLocaleMessages } from "./en-US";

export const pageTranslateJaJP: PageTranslateLocaleMessages = {
  menu: {
    translatePage: "このページを翻訳",
    showOriginal: "原文を表示",
  },
  menuItemLabel: "このページを翻訳 / 原文を表示",
  settingsTitle: "ページ翻訳",
  settingsDescription:
    "右クリックメニューからページ全体を翻訳します。「このページを翻訳」で翻訳し、「原文を表示」で元に戻します。",
  engine: "翻訳エンジン",
  engineDescription:
    "翻訳の取得元です。翻訳はこのデバイスに保存されるため、一度翻訳したページはすぐに表示されます。",
  engines: {
    model: "AI モデル",
    browser: "組み込み翻訳（デバイス上）",
    google: "Google 翻訳（無料）",
    microsoft: "Microsoft Translator（無料）",
  },
  engineDetails: {
    model: "設定済みの AI プロバイダーが、下で選んだモデルで翻訳します。",
    browser:
      "ブラウザーがこのデバイス上で翻訳します。テキストはデバイスの外に送信されません。言語ごとに一度だけダウンロードされます。",
    google:
      "非公式の無料サービスで、Google の API ではありません。いつでも使えなくなる可能性があります。",
    microsoft:
      "非公式の無料サービスで、Microsoft の API ではありません。いつでも使えなくなる可能性があります。",
  },
  cloudNotice: {
    google: "翻訳のため、ページのテキストが Google に送信されます。",
    microsoft: "翻訳のため、ページのテキストが Microsoft に送信されます。",
  },
  privacyLink: "プライバシーポリシー",
  model: "モデル",
  modelDescription: "ページを翻訳するモデルです。",
  defaultModel: "チャットで選択中のモデル",
  targetLanguage: "翻訳先の言語",
  targetLanguageDescription:
    "ページはこの言語に翻訳されます。拡張機能の言語は変わりません。",
  followInterface: "拡張機能の言語（{language}）",
  display: "表示",
  displayDescription:
    "「原文と訳文」では各段落を残し、その下に訳文を追加します。",
  displayModes: {
    bilingual: "原文と訳文",
    translation: "訳文のみ",
  },
  cache: "保存された翻訳",
  cacheDescription:
    "翻訳はこのデバイスに 30 日間保存され、翻訳済みのページはすぐに表示されます。",
  clearCache: "保存された翻訳を消去",
  cacheCleared: "保存された翻訳を消去しました。",
  errors: {
    unavailable:
      "{engine} を利用できません。設定でページ翻訳を確認してください。",
    rateLimited:
      "{engine} がこのネットワークからのリクエストを制限しています。しばらくしてから再試行するか、設定で別のエンジンを選んでください。",
    refused:
      "{engine} が翻訳を拒否しました。設定で別のエンジンを選んでください。",
    network:
      "{engine} に接続できませんでした。接続を確認してから再試行してください。",
    failed: "{engine} で翻訳できなかった段落があります。",
  },
  noModel:
    "AI モデルが設定されていません。設定でプロバイダーを追加してください。",
  browserUnsupported:
    "組み込み翻訳では、このページを{language}に翻訳できません。",
  unavailablePage:
    "このページは翻訳できません。ブラウザーが拡張機能による変更を許可していません。",
};
