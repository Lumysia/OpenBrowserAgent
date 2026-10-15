import type { SetupMessages } from "./en-US";

export const setupJaJP: SetupMessages = {
  continueSetup: "セットアップを続ける",
  runAgain: "セットアップをもう一度実行",
  progressLabel: "セットアップの手順",
  progressStep: "ステップ {current}/{total}：{step}",
  steps: {
    language: "言語",
    provider: "AI プロバイダー",
    pages: "ページ上の機能",
    done: "完了",
  },
  back: "戻る",
  next: "次へ",
  skipStep: "スキップ",
  languageTitle: "言語を選ぶ",
  languageDescription:
    "拡張機能の表示言語と、ページの翻訳先の言語です。ほとんどの場合はそのままで大丈夫です。",
  providerTitle: "AI プロバイダーに接続",
  providerDescription:
    "チャットとエージェントには AI プロバイダーが必要です。サービスを選ぶか、OpenAI 互換または Anthropic 互換のサーバーをベース URL で指定してください。",
  providerPlaceholder: "AI プロバイダーを選択",
  providerReady: "{name} の準備ができました。「次へ」で進みます。",
  testConnection: "接続をテスト",
  testingConnection: "テスト中…",
  connectionOk: "接続しました。{model} が応答しました。",
  connectionFailed: "AI プロバイダーに接続できませんでした",
  modelFailed: "接続しましたが、{model} が応答しませんでした",
  noModelsListed:
    "接続しましたが、AI プロバイダーからモデルの一覧が返されませんでした。モデル名を入力してください。",
  model: "モデル",
  modelName: "モデル名",
  modelNameHint:
    "AI プロバイダーがモデルの一覧を返さない場合は、モデル名を入力してもう一度テストしてください。",
  pagesTitle: "ページ上の機能",
  pagesDescription:
    "OpenBrowserAgent がアクセスしたページに追加する機能です。あとで「設定 → ページ上の機能」で変更できます。",
  translateButtonDescription:
    "ページの端にある小さなボタンで、ページを翻訳したり原文に戻したりできます。",
  smartBarTitle: "テキスト選択時のスマートバー",
  smartBarDescription:
    "選択したテキストの横にクイック操作を表示します。操作を選ぶまで何も送信されません。",
  subtitlesDescription: "字幕のある動画で、各行の下に翻訳を表示します。",
  doneTitle: "準備ができました",
  doneDescription:
    "サイドパネルを開いて、表示中のページについて質問しましょう。これらのキーはどのページでも使えます。",
  noProviderNote:
    "チャットには AI プロバイダーが必要です。組み込み翻訳を使うページ翻訳は AI プロバイダーなしで使えます。",
  welcomeTitle: "OpenBrowserAgent へようこそ",
  openPanelDescription:
    "ブラウザーの拡張機能メニューで OpenBrowserAgent を固定し、アイコンをクリックしてサイドパネルを開きます。",
  openPanel: "サイドパネルを開く",
  joinLink:
    "別のデバイスで OpenBrowserAgent を使っていますか？同期コードを貼り付け",
  codeTab: "コードを貼り付け",
  manualTab: "手動設定",
  code: "同期コード",
  codeDescription:
    "別のデバイスの「設定 → 同期」でコピーします。コードの同期設定がこのデバイスの設定に置き換わります。",
  codeInvalid:
    "有効な同期コードではありません。もう一度コピーして、コード全体を貼り付けてください。",
  connect: "接続して同期",
  testing: "接続中…",
  pulling: "同期中…",
  failed:
    "接続できませんでした。コードまたはサーバーの情報を確認して、もう一度お試しください。",
  connected: "接続しました。設定を同期しています。",
  keysLocked:
    "API キーは同期されていますが、ロックされています。同期パスフレーズを入力してください。",
  unlock: "ロック解除",
  skip: "今はスキップ",
};
