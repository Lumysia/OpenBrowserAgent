import { plural } from "../../plural";
import type { DownloadsLocaleMessages } from "./en-US";

export const downloadsJaJP: DownloadsLocaleMessages = {
  status: {
    completed: "{name} を保存しました · {size}",
    failed: "{name} をダウンロードできませんでした: {reason}",
    canceled: "{name} をキャンセルしました",
    in_progress: "{name} をダウンロード中 · {progress}",
    paused: "{name} を一時停止中 · {progress}",
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
