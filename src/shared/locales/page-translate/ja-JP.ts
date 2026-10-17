import type { PageTranslateLocaleMessages } from "./en-US";

export const pageTranslateJaJP: PageTranslateLocaleMessages = {
  menu: {
    translatePage: "このページを翻訳",
    showOriginal: "原文を表示",
  },
  menuItemLabel: "このページを翻訳 / 原文を表示",
  settingsTitle: "ページ翻訳",
  settingsDescription:
    "ページ端のボタン、キーボードショートカット、または右クリックメニューの「このページを翻訳」でページを翻訳できます。もう一度行うと原文に戻ります。",
  engine: "翻訳エンジン",
  engineDescription: "ページの翻訳に使うものを選びます。",
  engines: {
    model: "AI モデル",
    browser: "組み込み翻訳（デバイス上）",
    google: "Google 翻訳（無料）",
    microsoft: "Microsoft Translator（無料）",
  },
  engineDetails: {
    model:
      "「AI プロバイダーとモデル」で設定した翻訳モデルを使い、AI プロバイダーがページを翻訳します。",
    browser:
      "ブラウザーがこのデバイス上で翻訳します。テキストはデバイスの外に送信されません。言語ごとに一度だけダウンロードされます。翻訳できないページは、下の AI モデルで翻訳します。",
    google:
      "非公式の無料サービスで、Google の API ではありません。いつでも使えなくなる可能性があります。",
    microsoft:
      "非公式の無料サービスで、Microsoft の API ではありません。いつでも使えなくなる可能性があります。",
  },
  cloudNotice: {
    google:
      "翻訳のため、ページのテキストが Google に送信されます。Google が失敗した場合、そのページの残りは Microsoft が翻訳します。",
    microsoft:
      "翻訳のため、ページのテキストが Microsoft に送信されます。Microsoft が失敗した場合、そのページの残りは Google が翻訳します。",
  },
  engineNames: {
    model: "AI モデル",
    browser: "組み込み翻訳",
    google: "Google",
    microsoft: "Microsoft",
  },
  privacyLink: "プライバシーポリシー",
  modelDescription: "ページを翻訳するモデルです。",
  targetLanguage: "翻訳先の言語",
  targetLanguageDescription:
    "ページ、動画の字幕、スマートバーの「翻訳」はこの言語を使います。拡張機能の言語は変わりません。",
  followInterface: "拡張機能の言語（{language}）",
  display: "表示",
  displayDescription:
    "「原文と訳文」では各段落を残し、その下に訳文を追加します。",
  displayModes: {
    bilingual: "原文と訳文",
    translation: "訳文のみ",
  },
  translateMenus: "メニューとボタンも翻訳",
  translateMenusDescription:
    "オフのときは、ナビゲーション、メニュー、ボタン、タブ、フッターの短いラベルはそのままにします。その中の見出し、文、質問は翻訳します。",
  cache: "保存された翻訳",
  cacheDescription:
    "翻訳はこのデバイスに 30 日間保存され、翻訳済みのページはすぐに表示されます。",
  clearCache: "保存された翻訳を消去",
  cacheCleared: "保存された翻訳を消去しました。",
  clearCacheFailed: "保存された翻訳を消去できませんでした",
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
    allFailed:
      "{engine} と {fallback} のどちらでも翻訳できませんでした。しばらくしてから再試行するか、設定で別のエンジンを選んでください。",
  },
  switched: {
    rateLimited:
      "{engine} がリクエストを制限しているため、このページは {fallback} で翻訳します。",
    failed:
      "{engine} が現在使えないため、このページは {fallback} で翻訳します。",
    unavailable:
      "{engine}ではこのページを翻訳できないため、{fallback}で翻訳します。",
  },
  browserMissing:
    "このブラウザーには組み込み翻訳がないため、下の AI モデルでページを翻訳します。",
  notStarted:
    "このページの翻訳を開始できませんでした。ページを再読み込みして、もう一度お試しください。",
  unavailablePage:
    "このページは翻訳できません。ブラウザーが拡張機能による変更を許可していません。",
  button: {
    translating: "翻訳中…",
    hide: "翻訳ボタンを非表示",
    hideOnSite: "{site} で非表示",
    hideEverywhere: "すべてのサイトで非表示",
    setting: "ページ上の翻訳ボタン",
    settingDescription:
      "ウェブページの端に小さなボタンを表示し、ページを翻訳したり原文を表示したりします。ドラッグして移動でき、ウィンドウのいちばん近い端に留まります。「翻訳先の言語」と同じ言語のページには表示されません。",
    move: "矢印キーで端に沿って移動し、E キーで次の端に移動します。",
    hiddenSites: "非表示にしたサイト",
    hiddenSitesDescription:
      "これらのサイトではボタンを表示しません。サイトにはそのサブドメインも含まれます。",
  },
  subtitles: {
    menu: "字幕を翻訳",
    menuHide: "翻訳した字幕を非表示",
    menuItemLabel: "字幕を翻訳 / 翻訳を非表示（動画上）",
    noCaptions:
      "この動画の字幕がまだ見つかりません。プレーヤーで字幕をオンにしてください。表示されしだい翻訳します。",
    liveOnly:
      "画面の字幕を表示されしだい翻訳しています。先まで翻訳するには、プレーヤーの字幕をいったんオフにしてからオンにしてください。",
    noVideo: "ここには字幕を翻訳できる動画がありません。",
    // Settings: subtitles start by themselves on every video.
    setting: "動画の字幕を自動で翻訳",
    settingDescription:
      "字幕のある動画では、どのサイトでも各行の下に翻訳を表示します。動画のコンテキストメニューの「字幕を翻訳」で、その動画だけオフ／オンにできます。この設定がオフでも、メニューと「このページを翻訳」で字幕を翻訳できます。",
    // Settings: how translated subtitles look; the preview's two lines.
    style: {
      title: "字幕のスタイル",
      description:
        "動画に重ねて表示する翻訳字幕の見た目です。表示中の字幕にもすぐ反映されます。",
      preview: "プレビュー",
      previewOriginal: "The river was high that spring.",
      previewTranslation: "その春、川の水は高かった。",
      background: "背景の不透明度",
      translationColor: "訳文の色",
      originalColor: "原文の色",
      colors: {
        yellow: "黄",
        white: "白",
        cyan: "水色",
        grey: "グレー",
      },
      font: "フォント",
      fonts: {
        system: "システム",
        serif: "セリフ",
        monospace: "等幅",
      },
      size: "サイズ",
      showOriginal: "原文の行を表示",
      showOriginalDescription: "オフにすると訳文だけを表示します。",
    },
  },
};
