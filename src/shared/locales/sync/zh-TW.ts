import type { SyncMessages } from "./en-US";

export const syncZhTW: SyncMessages = {
  statusTitle: "同步狀態",
  stateOff: "同步已關閉",
  stateNeverSynced: "尚未同步",
  stateSynced: "已是最新",
  stateSyncing: "正在同步…",
  statePending: "{count} 項變更等待同步",
  statePaused: "已暫停，直到 {time}",
  stateError: "上次同步失敗",
  stateAttention: "同步需要你處理",
  lastSync: "上次同步：{time}",
  pausedRateLimit: "伺服器要求降低請求頻率（HTTP {status}）。同步會自動恢復。",
  syncNow: "立即同步",
  webDavOnly: "對話和附件只能透過 WebDAV 同步，瀏覽器帳號同步的儲存空間太小。",
  warnings: {
    "unreliable-etags":
      "這個伺服器的檔案版本資訊不可靠，因此本裝置的變更不會上傳。請使用提供強 ETag 的 WebDAV 伺服器。",
    "ignores-preconditions":
      "這個伺服器不支援版本檢查，兩台裝置同時儲存時，一方上傳的內容可能覆寫另一方。每台裝置會保留自己的變更，直到在伺服器上看到它們，並在下次同步時重新合併。如果雙方改了同一個值，會保留較新的變更。",
    "newer-format":
      "另一台裝置使用了較新的同步格式。請在本裝置上更新 OpenBrowserAgent 以繼續同步。",
    "missing-content":
      "伺服器上缺少部分同步內容。本裝置會保留自己的副本，直到其他裝置重新上傳。",
    quota: "瀏覽器帳號同步儲存空間已滿。請關閉部分同步項目或改用 WebDAV。",
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
