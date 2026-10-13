import type { SyncMessages } from "./en-US";

export const syncJaJP: SyncMessages = {
  statusTitle: "同期の状態",
  stateOff: "同期はオフです",
  stateNeverSynced: "まだ同期していません",
  stateSynced: "最新の状態です",
  stateSyncing: "同期中…",
  statePending: "{count}件の変更が同期を待っています",
  statePaused: "{time} まで一時停止中",
  stateError: "前回の同期に失敗しました",
  stateAttention: "同期の確認が必要です",
  lastSync: "前回の同期: {time}",
  pausedRateLimit:
    "サーバーからリクエストを減らすよう求められました (HTTP {status})。同期は自動で再開します。",
  syncNow: "今すぐ同期",
  webDavOnly:
    "チャットと添付ファイルは WebDAV でのみ同期します。ブラウザーのアカウント同期は容量が小さすぎます。",
  warnings: {
    "unreliable-etags":
      "このサーバーのファイルバージョンは信頼できないため、このデバイスの変更はアップロードされません。強い ETag を返す WebDAV サーバーを使ってください。",
    "ignores-preconditions":
      "このサーバーはアップロード時のバージョン確認を無視します。2 台のデバイスで同時に保存すると、上書きされた変更はそのデバイスの次回の確認で再アップロードされます。",
    "newer-format":
      "別のデバイスが新しい同期形式を使っています。同期を続けるには、このデバイスの OpenBrowserAgent を更新してください。",
    "missing-content":
      "同期した内容の一部がサーバーにありません。別のデバイスが再アップロードするまで、このデバイスのコピーを残します。",
    quota:
      "ブラウザーのアカウント同期の容量がいっぱいです。同期する項目を減らすか、WebDAV を使ってください。",
  },
  massDeleteTitle: "別のデバイスからの削除を確認",
  massDeleteDescription:
    "最新の同期を適用すると、このデバイスの{collection}にある {total} 件のうち {count} 件が削除されます。",
  massDeleteApply: "このデバイスで削除",
  massDeleteKeep: "残して再アップロード",
  massDeleteLocalTitle: "このデバイスでの削除を確認",
  massDeleteLocalDescription:
    "このデバイスの{collection}から {total} 件のうち {count} 件がなくなっています。同期すると、すべてのデバイスで削除されます。",
  massDeleteLocalApply: "すべてのデバイスで削除",
  massDeleteLocalKeep: "このデバイスに復元",
};
