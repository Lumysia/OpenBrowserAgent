import { plural } from "../../plural";
import type { SyncMessages } from "./en-US";

export const syncKo: SyncMessages = {
  statusTitle: "동기화 상태",
  stateOff: "동기화가 꺼져 있어요",
  stateNeverSynced: "아직 동기화하지 않았어요",
  stateSynced: "최신 상태예요",
  stateSyncing: "동기화 중…",
  statePending: plural({ other: "변경 {count}개가 동기화를 기다리고 있어요" }),
  statePaused: "{time}까지 일시 중지됨",
  stateError: "마지막 동기화에 실패했어요",
  stateAttention: "동기화를 확인해야 해요",
  lastSync: "마지막 동기화: {time}",
  pausedRateLimit:
    "서버가 요청을 줄이라고 응답했어요 (HTTP {status}). 동기화는 자동으로 다시 시작돼요.",
  syncNow: "지금 동기화",
  webDavOnly:
    "WebDAV 전용이에요. 브라우저 계정 동기화 저장 공간은 너무 작아요.",
  groupSettings: "설정",
  groupSettingsDescription:
    "항상 동기화: 언어, 환경설정, 키를 제외한 AI 제공업체와 MCP 서버, MEMORY.md와 USER.md를 포함한 에이전트, 파일을 제외한 스킬.",
  groupAlways: "항상",
  groupKeys: "키",
  groupKeysDescription:
    "API 키와 MCP 헤더. 이 기기를 떠나기 전에 동기화 암호 문구로 암호화됩니다.",
  groupChats: "채팅",
  groupChatsDescription:
    "첨부 파일을 제외한 채팅 기록. 로컬 전용 채팅이라면 꺼 두세요.",
  groupFiles: "파일",
  groupFilesDescription:
    "스킬 파일, MEMORY.md와 USER.md 이외의 에이전트 워크스페이스 파일, 채팅 첨부 파일(채팅이 켜져 있을 때).",
  passphrase: "동기화 암호 문구",
  passphraseRepeat: "암호 문구 다시 입력",
  passphraseCreate:
    "동기화 암호 문구를 설정하세요. 키를 동기화하는 기기마다 한 번 입력합니다. 복구할 수 없으니 잊어버리면 새로 설정하세요. 키는 각 기기에 그대로 남습니다.",
  passphraseEnter:
    "키는 다른 기기에서 설정한 동기화 암호 문구로 암호화되어 있습니다. 이 기기에서 키를 동기화하려면 한 번 입력하세요.",
  passphraseChangeDescription:
    "새 동기화 암호 문구를 설정하세요. 다른 기기에서 한 번 입력하라고 묻습니다.",
  passphraseTooShort: "{min}자 이상 입력하세요.",
  passphraseMismatch: "암호 문구가 일치하지 않습니다.",
  passphraseWrong:
    "암호 문구가 틀렸습니다. 다른 기기에서 설정한 암호 문구를 입력하세요.",
  passphraseSave: "암호 문구 저장",
  passphraseChange: "암호 문구 변경",
  keysLocked: "이 기기에서 키를 동기화하려면 동기화 암호 문구를 입력하세요.",
  keysUnlocked: "키는 동기화 암호 문구로 암호화되어 동기화됩니다.",
  filesNotSynced:
    "이 기기에서는 파일을 동기화하지 않습니다. 다른 기기의 파일은 그대로 유지됩니다.",
  warnings: {
    "unreliable-etags":
      "이 서버에는 안전하게 쓸 수 없어요. 강한 ETag를 보내는 WebDAV 서버를 사용하세요.",
    "ignores-preconditions":
      "이 서버는 버전 확인을 지원하지 않지만 동기화가 알아서 처리해요.",
    "newer-format":
      "다른 기기가 더 새로운 동기화 형식을 사용하고 있어요. 계속 동기화하려면 OpenBrowserAgent를 업데이트하세요.",
    "missing-content": "동기화된 내용 일부가 서버에 없어요.",
    quota:
      "브라우저 계정 동기화 저장 공간이 가득 찼어요. 일부 동기화 항목을 끄거나 WebDAV를 사용하세요.",
    "cloned-device":
      "이 브라우저는 이제 새 기기로 동기화해요. 양쪽의 변경 사항은 모두 유지돼요.",
    "recovered-root":
      "서버의 동기화 파일이 손상되어 이전 사본과 이 기기의 데이터로 다시 만들었습니다.",
  },
  warningDetails: {
    "unreliable-etags":
      "이 서버의 파일 버전 정보를 믿을 수 없어 이 기기의 변경 사항을 업로드하지 않아요. 다른 기기의 변경 사항은 계속 내려받아요.",
    "ignores-preconditions":
      "두 기기에서 동시에 저장하면 한쪽의 업로드가 다른 쪽을 덮어쓸 수 있어요. 각 기기는 변경 사항을 보관하고 다음 동기화 때 다시 병합해요. 두 기기가 같은 값을 바꿨다면 더 최근 변경 사항이 남아요.",
    "missing-content":
      "다른 기기가 다시 업로드할 때까지 이 기기의 사본을 유지해요.",
    "cloned-device":
      "다른 브라우저가 이 기기로 동기화하고 있었어요(복사한 브라우저 프로필이나 다른 컴퓨터에 복원한 백업 등).",
    "recovered-root":
      "업로드가 중간에 멈추면 생깁니다. 기기의 데이터는 잃지 않았으며 각 기기가 변경 사항을 다시 업로드합니다.",
  },
  massDeleteTitle: "다른 기기에서 온 삭제 확인",
  massDeleteDescription:
    "최신 동기화를 적용하면 이 기기의 {collection} 항목 {total}개 중 {count}개가 삭제돼요.",
  massDeleteApply: "이 기기에서 삭제",
  massDeleteKeep: "유지하고 다시 업로드",
  massDeleteLocalTitle: "이 기기의 삭제 확인",
  massDeleteLocalDescription:
    "이 기기의 {collection} 항목 {total}개 중 {count}개가 사라졌어요. 동기화하면 모든 기기에서 삭제돼요.",
  massDeleteLocalApply: "모든 기기에서 삭제",
  massDeleteLocalKeep: "이 기기에 복원",
  choiceTitle: "이 기기 동기화",
  choiceOff: "끔",
  choiceBrowser: "브라우저 계정",
  choiceWebDav: "WebDAV",
  choiceOffHint: "모든 내용이 이 기기에만 저장됩니다.",
  whatSyncs: "동기화할 항목",
  copyCode: "다른 기기용 동기화 코드 복사",
  codeCopied: "동기화 코드를 복사했습니다",
  codeTitle: "동기화 코드",
  pasteCode: "다른 기기의 동기화 코드 붙여넣기",
};
