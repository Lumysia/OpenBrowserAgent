import { plural } from "../../plural";
import type { SyncMessages } from "./en-US";

export const syncZhTW: SyncMessages = {
  statusTitle: "同步狀態",
  stateOff: "同步已關閉",
  stateNeverSynced: "尚未同步",
  stateSynced: "已是最新",
  stateSyncing: "正在同步…",
  statePending: plural({ other: "{count} 項變更等待同步" }),
  statePaused: "已暫停，直到 {time}",
  stateError: "上次同步失敗",
  stateAttention: "同步需要你處理",
  lastSync: "上次同步：{time}",
  pausedRateLimit: "伺服器要求降低請求頻率（HTTP {status}）。同步會自動恢復。",
  syncNow: "立即同步",
  webDavOnly: "僅支援 WebDAV：瀏覽器帳號同步的儲存空間太小。",
  warnings: {
    "unreliable-etags":
      "無法安全寫入這個伺服器。請使用提供強 ETag 的 WebDAV 伺服器。",
    "ignores-preconditions": "這個伺服器不支援版本檢查，同步會自動處理。",
    "newer-format":
      "另一台裝置使用了較新的同步格式。請更新 OpenBrowserAgent 以繼續同步。",
    "missing-content": "伺服器上缺少部分同步內容。",
    quota: "瀏覽器帳號同步儲存空間已滿。請關閉部分同步項目或改用 WebDAV。",
    "cloned-device": "這個瀏覽器現在會以新裝置的身分同步，兩邊的變更都會保留。",
  },
  warningDetails: {
    "unreliable-etags":
      "這個伺服器的檔案版本資訊不可靠，因此本裝置不會上傳變更，但仍會下載其他裝置的變更。",
    "ignores-preconditions":
      "兩台裝置同時儲存時，一方上傳的內容可能覆寫另一方。每台裝置會保留自己的變更，並在下次同步時重新合併。如果雙方改了同一個值，會保留較新的變更。",
    "missing-content": "本裝置會保留自己的副本，直到其他裝置重新上傳。",
    "cloned-device":
      "另一個瀏覽器曾以本裝置的身分同步，例如複製的瀏覽器設定檔，或在另一台電腦上還原的備份。",
  },
  massDeleteTitle: "確認來自其他裝置的刪除",
  massDeleteDescription:
    "最新的同步會在本裝置上刪除{collection}中 {total} 項裡的 {count} 項。",
  massDeleteApply: "在本裝置上刪除",
  massDeleteKeep: "保留並重新上傳",
  massDeleteLocalTitle: "確認本裝置上的刪除",
  massDeleteLocalDescription:
    "本裝置上{collection}中 {total} 項裡有 {count} 項已不在。同步會在所有裝置上刪除它們。",
  massDeleteLocalApply: "在所有裝置上刪除",
  massDeleteLocalKeep: "在本裝置上還原",
};
