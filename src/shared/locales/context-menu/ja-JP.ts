import type { ContextMenuLocaleMessages } from "./en-US";

export const contextMenuJaJP: ContextMenuLocaleMessages = {
  items: {
    ask: "このページについて質問・操作",
    summarizePage: "このページを要約",
    searchPage: "このページの関連情報をウェブ検索",
    searchSelection: "「%s」をウェブ検索",
    summarizeLink: "リンク先のページを要約",
    copyMarkdown: "Markdown としてコピー",
  },
  searchSelectionRequest: "選択したテキストの関連情報をウェブ検索",
  copied: "Markdown としてコピーしました",
  copyFailed:
    "クリップボードにコピーできませんでした。ページをクリックしてもう一度お試しください。",
  copyUnavailable:
    "このページはコピーできません。ブラウザーが拡張機能による読み取りを許可していません。",
  settingsTitle: "コンテキストメニュー",
  settingsDescription:
    "ページを右クリックしたときのメニューに表示する OpenBrowserAgent の操作です。",
  enable: "コンテキストメニューに表示",
  enableDescription:
    "ページ、リンク、画像、選択したテキストを右クリックしたときに OpenBrowserAgent のサブメニューを表示します。",
  itemsTitle: "メニュー項目",
  itemsDescription:
    "サイドパネルを開く操作は、ページをエージェントに渡します。「Markdown としてコピー」は AI を使いません。",
  itemLabels: {
    ask: "このページについて質問・操作",
    summarizePage: "このページを要約",
    searchWeb: "このページまたは選択したテキストの関連情報をウェブ検索",
    summarizeLink: "リンク先のページを要約（リンク上）",
    copyMarkdown: "Markdown としてコピー",
  },
};
