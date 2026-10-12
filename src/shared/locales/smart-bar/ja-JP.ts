import type { SmartBarLocaleMessages } from "./en-US";

export const smartBarJaJP: SmartBarLocaleMessages = {
  barLabel: "スマートバー",
  actions: {
    ask: "サイドパネルで質問",
    explain: "説明",
    translate: "翻訳",
    summarize: "要約",
    copy: "コピー",
    improve: "文章を改善",
    fixGrammar: "スペルと文法を修正",
  },
  copied: "コピーしました",
  closeMenu: "スマートバーのオプション",
  hideOnSite: "{site} で非表示",
  turnOff: "スマートバーをオフにする",
  close: "閉じる",
  stop: "停止",
  retry: "再試行",
  replace: "置き換え",
  insertBelow: "下に挿入",
  continueInSidePanel: "サイドパネルで続ける",
  readSource: "原文を読み上げ",
  readResult: "結果を読み上げ",
  stopReading: "読み上げを停止",
  writing: "生成中…",
  emptyResult: "モデルからテキストが返されませんでした。",
  selectionChanged:
    "選択したテキストが変更されました。代わりに結果をコピーしてください。",
  selectionTooLong:
    "選択範囲が長すぎます（{max} 文字超）。代わりにサイドパネルで続けてください。",
  settingsTitle: "スマートバー",
  settingsDescription:
    "選択したテキストの横に表示される小さなツールバーで、AI のクイック操作を使えます。操作を選ぶまで何も送信されません。",
  enable: "スマートバーを表示",
  enableDescription:
    "既定ではオフです。オンにすると、OpenBrowserAgent は許可されたページでテキストの選択に反応します。",
  trigger: "表示するタイミング",
  triggerDescription:
    "キーボードショートカットはどちらのモードでも使えます。ブラウザーの拡張機能のショートカット設定で設定してください。",
  triggerSelection: "テキストを選択したとき",
  triggerShortcut: "ショートカットのみ",
  sites: "サイト",
  sitesDescription:
    "両方のリストが保持され、モードによってどちらを使うかが決まります。サイトにはサブドメインも含まれます。",
  siteModeBlockList: "ブロックしたサイト以外のすべて",
  siteModeAllowList: "許可したサイトのみ",
  blockedSites: "ブロックしたサイト",
  allowedSites: "許可したサイト",
  sitePlaceholder: "example.com",
  addSite: "サイトを追加",
  removeSite: "{host} を削除",
  invalidSite: "example.com のようなサイトを入力してください。",
  noSites: "サイトはまだありません。",
  pageActions: "ページのテキスト用の操作",
  pageActionsDescription: "ページ上のテキストを選択したときに表示されます。",
  editActions: "編集中のテキスト用の操作",
  editActionsDescription:
    "テキスト入力欄でテキストを選択したときに表示されます。結果で選択範囲を置き換えられます。",
  model: "スマートバーのモデル",
  modelDescription: "「説明」「翻訳」「要約」と文章作成の操作に使うモデル。",
};
