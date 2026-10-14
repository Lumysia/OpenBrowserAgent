import { plural } from "../../plural";
import type { SyncMessages } from "./en-US";

export const syncJaJP: SyncMessages = {
  statusTitle: "同期の状態",
  stateOff: "同期はオフです",
  stateNeverSynced: "まだ同期していません",
  stateSynced: "最新の状態です",
  stateSyncing: "同期中…",
  statePending: plural({ other: "{count}件の変更が同期を待っています" }),
  statePaused: "{time} まで一時停止中",
  stateError: "前回の同期に失敗しました",
  stateAttention: "同期の確認が必要です",
  lastSync: "前回の同期: {time}",
  pausedRateLimit:
    "サーバーからリクエストを減らすよう求められました (HTTP {status})。同期は自動で再開します。",
  syncNow: "今すぐ同期",
  webDavOnly:
    "WebDAV のみ対応です。ブラウザーのアカウント同期は容量が小さすぎます。",
  groupSettings: "設定",
  groupSettingsDescription:
    "常に同期：言語、設定、キーを除く AI プロバイダーと MCP サーバー、MEMORY.md と USER.md を含むエージェント、ファイルを除くスキル。",
  groupAlways: "常に",
  groupKeys: "キー",
  groupKeysDescription:
    "API キーと MCP のヘッダー。このデバイスから送られる前に同期パスフレーズで暗号化されます。",
  groupChats: "チャット",
  groupChatsDescription:
    "添付ファイルを除くチャット履歴。ローカルだけのチャットにするならオフのままにします。",
  groupFiles: "ファイル",
  groupFilesDescription:
    "スキルのファイル、MEMORY.md と USER.md 以外のエージェントのワークスペースのファイル、チャットの添付ファイル（チャットがオンのとき）。",
  passphrase: "同期パスフレーズ",
  passphraseRepeat: "パスフレーズをもう一度入力",
  passphraseCreate:
    "同期パスフレーズを設定します。キーを同期する各デバイスで一度だけ入力します。復元はできません。忘れた場合は新しく設定してください。キーは各デバイスに残ります。",
  passphraseEnter:
    "キーは別のデバイスで設定した同期パスフレーズで暗号化されています。ここでキーを同期するには一度入力してください。",
  passphraseChangeDescription:
    "新しい同期パスフレーズを設定します。ほかのデバイスでは一度だけ入力を求められます。",
  passphraseTooShort: "{min} 文字以上にしてください。",
  passphraseMismatch: "パスフレーズが一致しません。",
  passphraseWrong:
    "パスフレーズが違います。ほかのデバイスで設定したものを入力してください。",
  passphraseSave: "パスフレーズを保存",
  passphraseChange: "パスフレーズを変更",
  keysLocked:
    "このデバイスでキーを同期するには同期パスフレーズを入力してください。",
  keysUnlocked: "キーは同期パスフレーズで暗号化して同期されます。",
  filesNotSynced:
    "このデバイスではファイルを同期していません。ほかのデバイスのファイルはそのまま残ります。",
  warnings: {
    "unreliable-etags":
      "このサーバーには安全に書き込めません。強い ETag を返す WebDAV サーバーを使ってください。",
    "ignores-preconditions":
      "このサーバーはバージョン確認に対応していませんが、同期側で対処します。",
    "newer-format":
      "別のデバイスが新しい同期形式を使っています。同期を続けるには OpenBrowserAgent を更新してください。",
    "missing-content": "同期した内容の一部がサーバーにありません。",
    quota:
      "ブラウザーのアカウント同期の容量がいっぱいです。同期する項目を減らすか、WebDAV を使ってください。",
    "cloned-device":
      "このブラウザーは新しいデバイスとして同期します。両方の変更は保持されます。",
    "recovered-root":
      "サーバー上の同期ファイルが壊れていました。直前のコピーとこのデバイスのデータから作り直しました。",
  },
  warningDetails: {
    "unreliable-etags":
      "このサーバーのファイルバージョンは信頼できないため、このデバイスの変更はアップロードされません。他のデバイスの変更は引き続きダウンロードします。",
    "ignores-preconditions":
      "2 台のデバイスで同時に保存すると、一方のアップロードがもう一方を上書きすることがあります。各デバイスは自分の変更を保持し、次の同期で改めて統合します。両方が同じ値を変更した場合は、新しい方の変更が残ります。",
    "missing-content":
      "別のデバイスが再アップロードするまで、このデバイスのコピーを残します。",
    "cloned-device":
      "別のブラウザーがこのデバイスとして同期していました（コピーされたブラウザー プロファイルや、別のコンピューターに復元したバックアップなど）。",
    "recovered-root":
      "アップロードが途中で止まると起こります。デバイス上のデータは失われていません。各デバイスが変更をもう一度アップロードします。",
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
