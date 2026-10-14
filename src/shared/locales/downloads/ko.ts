import { plural } from "../../plural";
import type { DownloadsLocaleMessages } from "./en-US";

export const downloadsKo: DownloadsLocaleMessages = {
  titles: {
    downloaded: "다운로드됨",
    saved: "저장됨",
    failed: "다운로드 실패",
    downloading: "다운로드 중",
    paused: "다운로드 일시 중지됨",
    waiting: "확인을 기다리는 중",
    canceled: "취소됨",
    listed: "다운로드 목록 확인함",
    noneStarted: "시작된 다운로드 없음",
  },
  running: {
    download: "다운로드 중",
    save: "저장 중",
    images: "이미지 저장 중",
    list: "다운로드 확인 중",
    wait: "다운로드 기다리는 중",
    cancel: "다운로드 취소 중",
    retry: "다운로드 다시 시도 중",
  },
  status: {
    completed: "{name} · {size}",
    failed: "{name}: {reason}",
    canceled: "{name}",
    in_progress: "{name} · {progress}",
    paused: "{name} · {progress}",
    needs_confirmation:
      "브라우저가 {name}을(를) 보류했습니다: 브라우저의 다운로드 목록에서 유지를 선택하세요",
    choosing_location:
      "브라우저의 저장 대화상자에서 {name}을(를) 저장할 위치를 선택하세요",
  },
  moved: "{name}이(가) 이동되었거나 삭제되었습니다",
  htmlPage: "{name}은(는) 파일이 아니라 웹페이지입니다",
  reasons: {
    network: "네트워크 오류",
    missing: "서버에 파일이 없습니다",
    denied: "서버가 접근을 거부했습니다",
    signIn: "로그인이 필요합니다",
    disk: "파일을 쓸 수 없습니다",
    blocked: "브라우저가 차단했습니다",
    other: "다운로드 오류",
  },
  listed: plural({ other: "다운로드 {count}개" }),
  none: "다운로드 없음",
  showFileInFolder: "폴더에서 {name} 보기",
};
