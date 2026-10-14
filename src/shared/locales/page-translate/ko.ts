import type { PageTranslateLocaleMessages } from "./en-US";

export const pageTranslateKo: PageTranslateLocaleMessages = {
  menu: {
    translatePage: "이 페이지 번역",
    showOriginal: "원문 보기",
  },
  menuItemLabel: "이 페이지 번역 / 원문 보기",
  settingsTitle: "페이지 번역",
  settingsDescription:
    '컨텍스트 메뉴에서 "이 페이지 번역"을 선택하면 번역되고, "원문 보기"를 선택하면 원래대로 돌아갑니다.',
  engine: "번역 엔진",
  engineDescription: "페이지를 번역하는 데 사용할 엔진을 선택합니다.",
  engines: {
    model: "AI 모델",
    browser: "내장 번역기(기기 내)",
    google: "Google 번역(무료)",
    microsoft: "Microsoft Translator(무료)",
  },
  engineDetails: {
    model: "설정한 AI 제공업체가 아래에서 선택한 모델로 페이지를 번역합니다.",
    browser:
      "브라우저가 이 기기에서 번역하며, 텍스트가 기기 밖으로 나가지 않습니다. 언어마다 한 번만 다운로드합니다. 번역할 수 없는 페이지는 아래 AI 모델이 번역합니다.",
    google:
      "Google API가 아닌 비공식 무료 서비스입니다. 언제든지 작동이 중단될 수 있습니다.",
    microsoft:
      "Microsoft API가 아닌 비공식 무료 서비스입니다. 언제든지 작동이 중단될 수 있습니다.",
  },
  cloudNotice: {
    google:
      "번역을 위해 페이지 텍스트가 Google로 전송됩니다. Google이 실패하면 해당 페이지의 나머지는 Microsoft가 번역합니다.",
    microsoft:
      "번역을 위해 페이지 텍스트가 Microsoft로 전송됩니다. Microsoft가 실패하면 해당 페이지의 나머지는 Google이 번역합니다.",
  },
  engineNames: {
    model: "AI 모델",
    browser: "내장 번역기",
    google: "Google",
    microsoft: "Microsoft",
  },
  privacyLink: "개인정보 처리방침",
  model: "모델",
  modelDescription: "페이지를 번역할 모델입니다.",
  defaultModel: "채팅과 같은 모델",
  targetLanguage: "번역할 언어",
  targetLanguageDescription:
    "페이지를 이 언어로 번역합니다. 확장 프로그램의 언어는 바뀌지 않습니다.",
  followInterface: "확장 프로그램 언어({language})",
  display: "표시 방식",
  displayDescription:
    '"원문과 번역"은 각 단락을 그대로 두고 그 아래에 번역을 추가합니다.',
  displayModes: {
    bilingual: "원문과 번역",
    translation: "번역만",
  },
  translateMenus: "메뉴와 버튼도 번역",
  translateMenusDescription:
    "끄면 페이지의 본문만 번역하고 탐색, 메뉴, 버튼, 탭, 바닥글은 그대로 둡니다.",
  cache: "저장된 번역",
  cacheDescription:
    "번역은 이 기기에 30일 동안 보관되어 번역한 페이지가 바로 표시됩니다.",
  clearCache: "저장된 번역 지우기",
  cacheCleared: "저장된 번역을 지웠습니다.",
  clearCacheFailed: "저장된 번역을 지우지 못했습니다",
  errors: {
    unavailable:
      "{engine}을(를) 사용할 수 없습니다. 설정에서 페이지 번역을 확인하세요.",
    rateLimited:
      "{engine}이(가) 이 네트워크의 요청을 제한하고 있습니다. 나중에 다시 시도하거나 설정에서 다른 엔진을 선택하세요.",
    refused:
      "{engine}이(가) 번역을 거부했습니다. 설정에서 다른 엔진을 선택하세요.",
    network: "{engine}에 연결할 수 없습니다. 연결을 확인하고 다시 시도하세요.",
    failed: "{engine}이(가) 일부 단락을 번역하지 못했습니다.",
    allFailed:
      "{engine}과(와) {fallback} 모두 번역하지 못했습니다. 나중에 다시 시도하거나 설정에서 다른 엔진을 선택하세요.",
  },
  switched: {
    rateLimited:
      "{engine}이(가) 요청을 제한하고 있어 이 페이지는 {fallback}(으)로 번역합니다.",
    failed:
      "{engine}을(를) 지금 사용할 수 없어 이 페이지는 {fallback}(으)로 번역합니다.",
    unavailable:
      "{engine}(으)로는 이 페이지를 번역할 수 없어 {fallback}(으)로 번역합니다.",
  },
  browserMissing:
    "이 브라우저에는 내장 번역기가 없어 아래 AI 모델이 페이지를 번역합니다.",
  notStarted:
    "이 페이지의 번역을 시작하지 못했습니다. 페이지를 새로고침한 후 다시 시도하세요.",
  unavailablePage:
    "이 페이지는 번역할 수 없습니다. 브라우저가 확장 프로그램의 변경을 허용하지 않습니다.",
  subtitles: {
    menu: "자막 번역",
    menuItemLabel: "자막 번역 / 번역 숨기기(동영상에서)",
    start: "자막 번역",
    stop: "자막 번역 숨기기",
    noCaptions:
      "이 동영상의 자막을 아직 찾지 못했습니다. 플레이어에서 자막을 켜세요. 자막이 표시되는 즉시 번역합니다.",
    noVideo: "여기에는 자막을 번역할 동영상이 없습니다.",
    videoButton: "동영상 자막 버튼",
    videoButtonDescription:
      '동영상을 가리키면 모서리에 버튼을 표시해 자막을 번역할 수 있습니다. "이 페이지 번역"도 페이지에 있는 동영상의 자막을 번역합니다.',
  },
};
