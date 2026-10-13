import type { SyncMessages } from "./en-US";

export const syncZhCN: SyncMessages = {
  statusTitle: "同步状态",
  stateOff: "同步已关闭",
  stateNeverSynced: "尚未同步",
  stateSynced: "已是最新",
  stateSyncing: "正在同步…",
  statePending: "{count} 项更改等待同步",
  statePaused: "已暂停，直到 {time}",
  stateError: "上次同步失败",
  stateAttention: "同步需要你处理",
  lastSync: "上次同步：{time}",
  pausedRateLimit: "服务器要求降低请求频率（HTTP {status}）。同步会自动恢复。",
  syncNow: "立即同步",
  webDavOnly: "对话和附件只能通过 WebDAV 同步，浏览器账号同步的存储空间太小。",
  warnings: {
    "unreliable-etags":
      "此服务器的文件版本信息不可靠，因此本设备的更改不会上传。请使用提供强 ETag 的 WebDAV 服务器。",
    "ignores-preconditions":
      "此服务器不支持版本检查，已改用较慢的安全方式同步：两台设备同时保存时，其中一处更改会晚一轮同步，不会丢失。",
    "newer-format":
      "另一台设备使用了更新的同步格式。请在本设备上更新 OpenBrowserAgent 以继续同步。",
    "missing-content":
      "服务器上缺少部分同步内容。本设备会保留自己的副本，直到其他设备重新上传。",
    quota: "浏览器账号同步存储已满。请关闭部分同步项目或改用 WebDAV。",
  },
  massDeleteTitle: "确认来自其他设备的删除",
  massDeleteDescription:
    "最新的同步会在本设备上删除{collection}中 {total} 项里的 {count} 项。",
  massDeleteApply: "在本设备上删除",
  massDeleteKeep: "保留并重新上传",
  massDeleteLocalTitle: "确认本设备上的删除",
  massDeleteLocalDescription:
    "本设备上{collection}中 {total} 项里有 {count} 项已不在。同步会在所有设备上删除它们。",
  massDeleteLocalApply: "在所有设备上删除",
  massDeleteLocalKeep: "在本设备上恢复",
};
