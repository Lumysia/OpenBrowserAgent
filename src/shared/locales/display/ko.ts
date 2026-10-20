import { plural } from "../../plural";
import type { DisplayMessages } from "./en-US";

export const displayKo: DisplayMessages = {
  counts: {
    models: plural({ other: "모델 {count}개" }),
    files: plural({ other: "파일 {count}개" }),
    characters: plural({ other: "{count}자" }),
  },
  providerTypes: {
    openai: "OpenAI(또는 호환)",
    "openai-responses": "OpenAI(Responses API)",
    anthropic: "Anthropic(또는 호환)",
    gemini: "Google Gemini",
    ollama: "Ollama(로컬)",
  },
  mcpServerPresets: {
    exa: "웹 검색과 웹페이지 내용 추출.",
    parallel: "발췌문이 포함된 웹 검색과 웹페이지 가져오기.",
    tinyfish: "웹 및 뉴스 검색.",
    firecrawl:
      "웹 검색, 웹페이지 스크래핑, 문서 분석. 무료 요청 한도가 낮아요.",
  },
  builtinSkills: {
    "fill-form": {
      name: "양식 작성",
      description:
        "알려 준 정보나 파일로 웹 양식을 작성하고 모든 항목을 확인해요. 제출은 요청할 때만 해요.",
    },
    "tidy-tabs": {
      name: "탭 정리",
      description:
        "중복 탭을 닫고, 관련 탭을 그룹으로 묶고, 더 이상 필요 없는 탭을 찾아요.",
    },
    "openbrowseragent-help": {
      name: "OpenBrowserAgent 도움말",
      description: "OpenBrowserAgent 사용 및 설정에 관한 질문에 답해요.",
    },
    "skill-creator": {
      name: "스킬 만들기",
      description:
        "스킬을 만들거나 저장하거나 개선해요. 예를 들어 방금 한 작업을 스킬로 저장할 수 있어요.",
    },
    "local-execution-bridge-setup": {
      name: "로컬 실행 브리지 설정",
      description:
        "로컬 실행 브리지를 설정, 테스트, 업데이트 또는 제거해서 에이전트가 이 컴퓨터에서 명령을 실행할 수 있게 해요.",
    },
  },
  errors: {
    noModel:
      "설정된 모델이 없어요. ‘설정’ → ‘AI 제공업체’에서 제공업체를 추가하세요.",
    noImageModel:
      "설정된 이미지 모델이 없어요. ‘설정’ → ‘AI 제공업체’에서 선택하세요.",
    baseUrlRequired: "Base URL을 입력하세요.",
    bridgeNotFound: "이 실행 브리지는 더 이상 없습니다.",
    bridgeHostRequired: "네이티브 메시징 호스트 이름을 입력하세요.",
    bridgeTimeout: "실행 브리지가 제때 응답하지 않았습니다.",
    syncKeysLocked:
      "API 키가 동기화되었지만 잠겨 있습니다. 설정 → 동기화에서 동기화 암호 문구를 입력하세요.",
    teachUnscriptable: "이 페이지는 기록할 수 없습니다.",
    tabRecording:
      "이 탭은 기록 중입니다. 기록을 중지한 뒤 에이전트에게 맡기세요.",
    teachEmpty: "기록된 내용이 없습니다. 페이지에서 작업을 한 뒤 중지하세요.",
    teachNoInstructions: "모델이 지침을 작성하지 않았습니다. 다시 시도하세요.",
    teachGone: "이 기록은 더 이상 없습니다.",
    teachCheckTab: "확인용 탭을 열 수 없습니다.",
  },
  toolSteps: {
    failed: "실패",
    page: "페이지",
    tabs: plural({ other: "탭 {count}개" }),
    lines: plural({ other: "{count}줄" }),
    matchingLines: plural({ other: "일치하는 줄 {count}개" }),
    matchingLinesWithOccurrences: plural({
      other: "일치하는 줄 {count}개({occurrences})",
    }),
    occurrences: plural({ other: "{count}곳" }),
    results: plural({ other: "결과 {count}개" }),
    items: plural({ other: "항목 {count}개" }),
    tools: plural({ other: "도구 {count}개" }),
    filesSaved: plural({ other: "파일 {count}개 저장됨" }),
    editsApplied: plural({ other: "편집 {count}개 중 {applied}개 적용됨" }),
    actions: {
      open: "열었어요",
      switch: "전환했어요",
      close: "닫았어요",
      navigate: "이동했어요",
      back: "뒤로 갔어요",
      forward: "앞으로 갔어요",
      reload: "새로고침했어요",
      group: "그룹으로 묶었어요",
      ungroup: "그룹을 해제했어요",
      list: "목록을 가져왔어요",
      search: "검색했어요",
      read: "읽었어요",
      write: "작성했어요",
      append: "덧붙였어요",
      replace: "텍스트를 바꿨어요",
      delete: "삭제했어요",
      create: "만들었어요",
      patch: "편집했어요",
      add: "추가했어요",
      update: "업데이트했어요",
      test: "테스트했어요",
      status: "상태를 확인했어요",
      resources: "네트워크 리소스를 나열했어요",
      emulate: "기기를 에뮬레이션했어요",
      reset: "에뮬레이션을 초기화했어요",
      capture: "기록을 시작했어요",
      captured: "기록을 읽었어요",
      request: "요청을 읽었어요",
      download: "다운로드했어요",
      save: "저장했어요",
      wait: "다운로드를 기다렸어요",
      retry: "다시 시도했어요",
      images: "이미지를 저장했어요",
      run: "실행했어요",
      start: "시작했어요",
      cancel: "취소했어요",
      get: "가져왔어요",
      runNow: "실행을 시작했어요",
      pause: "일시 중지했어요",
      resume: "재개했어요",
    },
    commandStates: {
      running: "실행 중",
      done: "완료",
      error: "실패",
      canceled: "취소됨",
      missing: "작업을 찾을 수 없어요",
    },
    actStepSeparator: ", ",
    actSteps: {
      click: plural({ other: "요소 {count}개 클릭" }),
      type: plural({ other: "필드 {count}개 입력" }),
      press: plural({ other: "키 {count}개 누름" }),
      select: plural({ other: "옵션 {count}개 선택" }),
      hover: plural({ other: "요소 {count}개에 포인터 올림" }),
      scroll: plural({ other: "{count}번 스크롤" }),
      wait: plural({ other: "{count}번 대기" }),
      drag: plural({ other: "요소 {count}개 드래그" }),
      dialog: plural({ other: "대화상자 {count}개 응답" }),
      other: plural({ other: "기타 단계 {count}개 실행" }),
    },
  },
};
