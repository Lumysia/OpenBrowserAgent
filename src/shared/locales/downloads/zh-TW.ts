import { plural } from "../../plural";
import type { DownloadsLocaleMessages } from "./en-US";

export const downloadsZhTW: DownloadsLocaleMessages = {
  status: {
    completed: "已儲存 {name} · {size}",
    failed: "無法下載 {name}：{reason}",
    canceled: "已取消 {name}",
    in_progress: "正在下載 {name} · {progress}",
    paused: "已暫停 {name} · {progress}",
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
