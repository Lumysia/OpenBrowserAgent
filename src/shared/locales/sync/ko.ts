import type { SyncMessages } from "./en-US";

export const syncKo: SyncMessages = {
  statusTitle: "동기화 상태",
  stateOff: "동기화가 꺼져 있어요",
  stateNeverSynced: "아직 동기화하지 않았어요",
  stateSynced: "최신 상태예요",
  stateSyncing: "동기화 중…",
  statePending: "변경 {count}개가 동기화를 기다리고 있어요",
  statePaused: "{time}까지 일시 중지됨",
  stateError: "마지막 동기화에 실패했어요",
  stateAttention: "동기화를 확인해야 해요",
  lastSync: "마지막 동기화: {time}",
  pausedRateLimit:
    "서버가 요청을 줄이라고 응답했어요 (HTTP {status}). 동기화는 자동으로 다시 시작돼요.",
  syncNow: "지금 동기화",
  webDavOnly:
    "채팅과 첨부 파일은 WebDAV로만 동기화돼요. 브라우저 계정 동기화 저장 공간은 너무 작아요.",
  warnings: {
    "unreliable-etags":
      "이 서버의 파일 버전 정보를 믿을 수 없어 이 기기의 변경 사항을 업로드하지 않아요. 강한 ETag를 보내는 WebDAV 서버를 사용하세요.",
    "ignores-preconditions":
      "이 서버는 업로드할 때 버전 확인을 무시해요. 두 기기에서 동시에 저장하면 덮어쓴 변경 사항은 해당 기기의 다음 확인 때 다시 업로드돼요.",
    "newer-format":
      "다른 기기가 더 새로운 동기화 형식을 사용하고 있어요. 계속 동기화하려면 이 기기의 OpenBrowserAgent를 업데이트하세요.",
    "missing-content":
      "동기화된 내용 일부가 서버에 없어요. 다른 기기가 다시 업로드할 때까지 이 기기의 사본을 유지해요.",
    quota:
      "브라우저 계정 동기화 저장 공간이 가득 찼어요. 일부 동기화 항목을 끄거나 WebDAV를 사용하세요.",
  },
  massDeleteTitle: "다른 기기에서 온 삭제 확인",
  massDeleteDescription:
    "최신 동기화를 적용하면 이 기기의 {collection} 항목 {total}개 중 {count}개가 삭제돼요.",
  massDeleteApply: "이 기기에서 삭제",
  massDeleteKeep: "유지하고 다시 업로드",
};
