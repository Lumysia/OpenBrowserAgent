import { plural } from "../../plural";
import type { SyncMessages } from "./en-US";

export const syncZhCN: SyncMessages = {
  statusTitle: "同步状态",
  stateOff: "同步已关闭",
  stateNeverSynced: "尚未同步",
  stateSynced: "已是最新",
  stateSyncing: "正在同步…",
  statePending: plural({ other: "{count} 项更改等待同步" }),
  statePaused: "已暂停，直到 {time}",
  stateError: "上次同步失败",
  stateAttention: "同步需要你处理",
  lastSync: "上次同步：{time}",
  pausedRateLimit: "服务器要求降低请求频率（HTTP {status}）。同步会自动恢复。",
  syncNow: "立即同步",
  webDavOnly: "仅支持 WebDAV：浏览器账号同步的存储空间太小。",
  groupSettings: "设置",
  groupSettingsDescription:
    "始终同步：语言、偏好设置、不含密钥的 AI 提供商和 MCP 服务器、含 MEMORY.md 和 USER.md 的智能体，以及不含文件的技能。",
  groupAlways: "始终",
  groupKeys: "密钥",
  groupKeysDescription: "API Key 和 MCP 请求头，在离开本设备前用同步口令加密。",
  groupChats: "对话",
  groupChatsDescription: "不含附件的对话历史。只想在本地保留对话时请保持关闭。",
  groupFiles: "文件",
  groupFilesDescription:
    "技能文件、MEMORY.md 和 USER.md 以外的智能体工作区文件，以及对话附件（需开启对话同步）。",
  passphrase: "同步口令",
  passphraseRepeat: "再次输入口令",
  passphraseCreate:
    "设置同步口令。每台同步密钥的设备都需要输入一次。口令无法找回：忘记时请重新设置，各设备上的密钥都会保留。",
  passphraseEnter:
    "密钥已用另一台设备上设置的同步口令加密。输入一次即可在这里同步密钥。",
  passphraseChangeDescription: "设置新的同步口令。其他设备会要求输入一次。",
  passphraseTooShort: "请至少使用 {min} 个字符。",
  passphraseMismatch: "两次输入的口令不一致。",
  passphraseWrong: "口令错误。请输入在另一台设备上设置的口令。",
  passphraseSave: "保存口令",
  passphraseChange: "更改口令",
  keysLocked: "输入同步口令以在本设备上同步密钥。",
  keysUnlocked: "密钥使用同步口令加密后同步。",
  filesNotSynced: "本设备不同步文件。其他设备上的文件保持不变。",
  warnings: {
    "unreliable-etags":
      "无法安全写入此服务器。请使用提供强 ETag 的 WebDAV 服务器。",
    "ignores-preconditions": "此服务器不支持版本检查，同步会自动处理。",
    "newer-format":
      "另一台设备使用了更新的同步格式。请更新 OpenBrowserAgent 以继续同步。",
    "missing-content": "服务器上缺少部分同步内容。",
    quota: "浏览器账号同步存储已满。请关闭部分同步项目或改用 WebDAV。",
    "cloned-device": "此浏览器现在作为新设备同步，两边的更改都会保留。",
    "recovered-root":
      "服务器上的同步文件已损坏，已根据其上一份副本和本设备的数据重建。",
  },
  warningDetails: {
    "unreliable-etags":
      "此服务器的文件版本信息不可靠，因此本设备不会上传更改，但仍会下载其他设备的更改。",
    "ignores-preconditions":
      "两台设备同时保存时，一方上传的内容可能覆盖另一方。每台设备会保留自己的更改，并在下次同步时重新合并。如果双方改了同一个值，保留较新的更改。",
    "missing-content": "本设备会保留自己的副本，直到其他设备重新上传。",
    "cloned-device":
      "另一个浏览器曾以本设备的身份同步，例如复制的浏览器配置文件，或在另一台电脑上恢复的备份。",
    "recovered-root":
      "上传中途停止时会出现这种情况。各设备上的数据都没有丢失，每台设备都会重新上传其更改。",
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
