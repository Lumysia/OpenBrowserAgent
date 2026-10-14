import { plural } from "../../plural";
import type { DownloadsLocaleMessages } from "./en-US";

export const downloadsJaJP: DownloadsLocaleMessages = {
  titles: {
    downloaded: "ダウンロードしました",
    saved: "保存しました",
    failed: "ダウンロードに失敗しました",
    downloading: "ダウンロード中",
    paused: "ダウンロードを一時停止中",
    waiting: "操作を待っています",
    canceled: "キャンセルしました",
    listed: "ダウンロード一覧を確認しました",
    noneStarted: "ダウンロードは開始されませんでした",
  },
  running: {
    download: "ダウンロード中",
    save: "保存中",
    images: "画像を保存中",
    list: "ダウンロードを確認中",
    wait: "ダウンロードを待機中",
    cancel: "ダウンロードをキャンセル中",
    retry: "ダウンロードを再試行中",
  },
  status: {
    completed: "{name} · {size}",
    failed: "{name}: {reason}",
    canceled: "{name}",
    in_progress: "{name} · {progress}",
    paused: "{name} · {progress}",
    needs_confirmation:
      "ブラウザーが {name} を保留しています: ブラウザーのダウンロード一覧で保存を選んでください",
    choosing_location:
      "ブラウザーの「名前を付けて保存」ダイアログで {name} の保存先を選んでください",
  },
  moved: "{name} は移動または削除されました",
  htmlPage: "{name} はファイルではなくウェブページです",
  reasons: {
    network: "ネットワークエラー",
    missing: "サーバーにファイルがありません",
    denied: "サーバーがアクセスを拒否しました",
    signIn: "ログインが必要です",
    disk: "ファイルを書き込めませんでした",
    blocked: "ブラウザーがブロックしました",
    other: "ダウンロードエラー",
  },
  listed: plural({ other: "{count}件のダウンロード" }),
  none: "ダウンロードはありません",
  showFileInFolder: "{name} をフォルダーに表示",
};
