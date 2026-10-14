import { plural } from "../../plural";
import type { DownloadsLocaleMessages } from "./en-US";

export const downloadsZhTW: DownloadsLocaleMessages = {
  titles: {
    downloaded: "已下載",
    saved: "已儲存",
    failed: "下載失敗",
    downloading: "正在下載",
    paused: "下載已暫停",
    waiting: "等待你操作",
    canceled: "已取消",
    listed: "已列出下載",
    noneStarted: "沒有開始下載",
  },
  running: {
    download: "正在下載",
    save: "正在儲存",
    images: "正在儲存圖片",
    list: "正在查看下載",
    wait: "正在等待下載",
    cancel: "正在取消下載",
    retry: "正在重試下載",
  },
  status: {
    completed: "{name} · {size}",
    failed: "{name}：{reason}",
    canceled: "{name}",
    in_progress: "{name} · {progress}",
    paused: "{name} · {progress}",
    needs_confirmation: "瀏覽器攔下了 {name}：請在瀏覽器的下載清單中選擇保留",
    choosing_location: "請在瀏覽器的「另存新檔」對話框中選擇 {name} 的儲存位置",
  },
  moved: "{name} 已被移動或刪除",
  htmlPage: "{name} 是網頁，不是所需檔案",
  reasons: {
    network: "網路錯誤",
    missing: "伺服器上沒有這個檔案",
    denied: "伺服器拒絕存取",
    signIn: "需要登入",
    disk: "無法寫入檔案",
    blocked: "已被瀏覽器封鎖",
    other: "下載發生錯誤",
  },
  listed: plural({ other: "{count} 個下載項目" }),
  none: "沒有下載項目",
  showFileInFolder: "在資料夾中顯示 {name}",
};
