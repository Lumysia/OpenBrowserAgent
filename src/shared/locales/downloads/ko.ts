import { plural } from "../../plural";
import type { DownloadsLocaleMessages } from "./en-US";

export const downloadsKo: DownloadsLocaleMessages = {
  status: {
    completed: "{name} 저장됨 · {size}",
    failed: "{name} 다운로드 실패: {reason}",
    canceled: "{name} 취소됨",
    in_progress: "{name} 다운로드 중 · {progress}",
    paused: "{name} 일시 중지됨 · {progress}",
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
