import { plural } from "../../plural";
import type { DownloadsLocaleMessages } from "./en-US";

export const downloadsZhCN: DownloadsLocaleMessages = {
  status: {
    completed: "已保存 {name} · {size}",
    failed: "无法下载 {name}：{reason}",
    canceled: "已取消 {name}",
    in_progress: "正在下载 {name} · {progress}",
    paused: "已暂停 {name} · {progress}",
    needs_confirmation: "浏览器拦下了 {name}：请在浏览器的下载列表中选择保留",
    choosing_location: "请在浏览器的“另存为”对话框中选择 {name} 的保存位置",
  },
  moved: "{name} 已被移动或删除",
  htmlPage: "{name} 是网页，不是所需文件",
  reasons: {
    network: "网络错误",
    missing: "服务器上没有此文件",
    denied: "服务器拒绝访问",
    signIn: "需要登录",
    disk: "无法写入文件",
    blocked: "已被浏览器拦截",
    other: "下载出错",
  },
  listed: plural({ other: "{count} 个下载" }),
  none: "没有下载",
  showFileInFolder: "在文件夹中显示 {name}",
};
