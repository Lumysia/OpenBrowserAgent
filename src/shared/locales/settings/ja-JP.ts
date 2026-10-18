import type { SettingsMessages } from "./en-US";

export const settingsJaJP: SettingsMessages = {
  providersModels: "AI プロバイダーとモデル",
  agentsSkills: "エージェントとスキル",
  onPages: "ページ上の機能",
  advanced: "詳細設定",
  translate: "翻訳",
  rightClick: "右クリックメニュー",
  troubleshooting: "トラブルシューティング",
  shortcuts: "キーボードショートカット",
  shortcutsDescription:
    "OpenBrowserAgent のコマンドのショートカットです。ブラウザーが管理するので、ブラウザーのショートカット設定で変更します。",
  shortcutNone: "未設定",
  changeShortcuts: "ショートカットを変更",
  shortcutsFirefoxHint:
    "変更するには about:addons を開き、歯車ボタンをクリックして「拡張機能のショートカットキーの管理」を選びます。",
  openMenuCommand: "メニューを開く",
  openSidePanelCommand: "サイドパネルを開く",
  smartBarCommand: "選択したテキストにスマートバーを表示",
  translatePageCommand: "このページを翻訳、または原文を表示",
  sidePanelShortcutHint:
    "ブラウザーのショートカット設定でキーを選んでください（例：{keys}）。",
  // One command's keys, with a button to change them.
  commandShortcut: {
    // {shortcut}: the keys, as the browser shows them.
    current: "ショートカット：{shortcut}",
    none: "ショートカットが設定されていません",
    change: "ショートカットを変更",
  },
  chatBehavior: "チャットの動作",
  chatBehaviorDescription:
    "サイドパネルのスクロール、再試行、ツールのステップ数、季節の演出。",
  models: "モデル",
  modelsDescription:
    "各機能が使うモデルです。別のモデルを選ばない限り、チャットのモデルを使います。",
  modelChat: "チャット",
  modelHelper: "補助",
  modelSmartBar: "スマートバー",
  modelTranslation: "翻訳",
  modelTranslationUnavailable:
    "ページ翻訳は AI モデルではなく {engine} を使っています。翻訳エンジンは「ページ翻訳」の設定で変更できます。",
  modelImages: "画像",
  translateMenuItems: "右クリックメニューの項目",
  translateMenuItemsDescription:
    "右クリックメニューの翻訳項目です。メニュー自体のオン・オフは「右クリックメニュー」で切り替えます。",
};
