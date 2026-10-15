import type { SetupMessages } from "./en-US";

export const setupKo: SetupMessages = {
  continueSetup: "설정 계속하기",
  runAgain: "설정 다시 실행",
  progressLabel: "설정 단계",
  progressStep: "{total}단계 중 {current}단계: {step}",
  steps: {
    language: "언어",
    provider: "AI 제공업체",
    pages: "페이지 기능",
    done: "완료",
  },
  back: "이전",
  next: "다음",
  skipStep: "건너뛰기",
  languageTitle: "언어 선택",
  languageDescription:
    "확장 프로그램의 표시 언어와 페이지를 번역할 언어입니다. 대부분은 그대로 두면 됩니다.",
  providerTitle: "AI 제공업체 연결",
  providerDescription:
    "채팅과 에이전트에는 AI 제공업체가 필요합니다. 서비스를 고르거나, OpenAI 또는 Anthropic 호환 서버를 Base URL로 지정하세요.",
  providerPlaceholder: "AI 제공업체 선택",
  providerReady: "{name} 준비가 끝났습니다. 계속하려면 '다음'을 누르세요.",
  testConnection: "연결 테스트",
  testingConnection: "테스트 중…",
  connectionOk: "연결되었습니다. {model}이(가) 응답했습니다.",
  connectionFailed: "AI 제공업체에 연결할 수 없습니다",
  modelFailed: "연결되었지만 {model}이(가) 응답하지 않았습니다",
  noModelsListed:
    "연결되었지만 AI 제공업체가 모델 목록을 제공하지 않았습니다. 모델 이름을 입력하세요.",
  model: "모델",
  modelName: "모델 이름",
  modelNameHint:
    "AI 제공업체가 모델 목록을 제공하지 않으면 모델 이름을 입력한 뒤 다시 테스트하세요.",
  pagesTitle: "페이지 기능",
  pagesDescription:
    "OpenBrowserAgent가 방문하는 페이지에 더하는 기능입니다. 나중에 설정 → 페이지 기능에서 바꿀 수 있습니다.",
  translateButtonDescription:
    "페이지 가장자리의 작은 버튼으로 페이지를 번역하거나 원문을 봅니다.",
  smartBarTitle: "텍스트 선택 시 스마트 바",
  smartBarDescription:
    "선택한 텍스트 옆에 빠른 작업을 보여 줍니다. 작업을 고르기 전에는 아무것도 보내지 않습니다.",
  subtitlesDescription:
    "자막이 있는 동영상에서 각 줄 아래에 번역을 보여 줍니다.",
  doneTitle: "설정이 끝났습니다",
  doneDescription:
    "사이드 패널을 열고 보고 있는 페이지에 대해 물어보세요. 이 단축키는 어느 페이지에서나 작동합니다.",
  noProviderNote:
    "채팅에는 AI 제공업체가 필요합니다. 내장 번역기를 쓰는 페이지 번역은 없어도 됩니다.",
  welcomeTitle: "OpenBrowserAgent에 오신 것을 환영합니다",
  openPanelDescription:
    "브라우저의 확장 프로그램 메뉴에서 OpenBrowserAgent를 고정한 뒤 아이콘을 클릭해 사이드 패널을 여세요.",
  openPanel: "사이드 패널 열기",
  joinLink:
    "다른 기기에서 이미 OpenBrowserAgent를 사용 중인가요? 동기화 코드 붙여넣기",
  codeTab: "코드 붙여넣기",
  manualTab: "수동 입력",
  code: "동기화 코드",
  codeDescription:
    "다른 기기의 설정 → 동기화에서 복사하세요. 코드의 동기화 선택이 이 기기의 선택을 대체합니다.",
  codeInvalid:
    "올바른 동기화 코드가 아닙니다. 다시 복사해 코드 전체를 붙여넣으세요.",
  connect: "연결 및 동기화",
  testing: "연결 중…",
  pulling: "동기화 중…",
  failed: "연결하지 못했습니다. 코드나 서버 정보를 확인한 뒤 다시 시도하세요.",
  connected: "연결되었습니다. 설정을 동기화하고 있습니다.",
  keysLocked:
    "API 키가 동기화되었지만 잠겨 있습니다. 동기화 암호 문구를 입력하세요.",
  unlock: "잠금 해제",
  skip: "나중에 하기",
};
