import type { PageTranslateLocaleMessages } from "./en-US";

export const pageTranslateKo: PageTranslateLocaleMessages = {
  menu: {
    translatePage: "이 페이지 번역",
    showOriginal: "원문 보기",
  },
  menuItemLabel: "이 페이지 번역 / 원문 보기",
  settingsTitle: "페이지 번역",
  settingsDescription:
    '페이지 가장자리의 버튼, 키보드 단축키 또는 컨텍스트 메뉴의 "이 페이지 번역"으로 페이지를 번역합니다. 한 번 더 하면 원문으로 돌아갑니다.',
  engine: "번역 엔진",
  engineDescription: "페이지를 번역하는 데 사용할 엔진을 선택합니다.",
  engines: {
    model: "AI 모델",
    browser: "내장 번역기(기기 내)",
    google: "Google 번역(무료)",
    microsoft: "Microsoft Translator(무료)",
  },
  engineDetails: {
    model:
      "AI 제공업체 및 모델에서 설정한 번역 모델로 AI 제공업체가 페이지를 번역합니다.",
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
  modelDescription: "페이지를 번역할 모델입니다.",
  targetLanguage: "번역할 언어",
  targetLanguageDescription:
    "페이지, 동영상 자막, 스마트 바의 '번역'에 이 언어를 사용합니다. 확장 프로그램의 언어는 바뀌지 않습니다.",
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
    "끄면 탐색, 메뉴, 버튼, 탭, 바닥글의 짧은 레이블은 그대로 둡니다. 그 안의 제목, 문장, 질문은 번역합니다.",
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
  button: {
    translating: "번역 중…",
    hide: "번역 버튼 숨기기",
    hideOnSite: "{site}에서 숨기기",
    hideEverywhere: "모든 사이트에서 숨기기",
    setting: "페이지의 번역 버튼",
    settingDescription:
      "웹 페이지 가장자리에 작은 버튼을 표시해 페이지를 번역하거나 원문을 보여 줍니다. 드래그해 옮길 수 있으며, 창의 가장 가까운 가장자리에 붙습니다. '번역할 언어'와 같은 언어의 페이지에는 표시되지 않습니다.",
    move: "화살표 키로 가장자리를 따라 옮기고, E 키로 다음 가장자리로 옮깁니다.",
    hiddenSites: "숨긴 사이트",
    hiddenSitesDescription:
      "이 사이트에서는 버튼이 표시되지 않습니다. 사이트에는 하위 도메인도 포함됩니다.",
  },
  subtitles: {
    menu: "자막 번역",
    menuHide: "번역된 자막 숨기기",
    menuItemLabel: "자막 번역 / 번역 숨기기(동영상에서)",
    noCaptions:
      "이 동영상의 자막을 아직 찾지 못했습니다. 플레이어에서 자막을 켜세요. 자막이 표시되는 즉시 번역합니다.",
    liveOnly:
      "화면에 표시되는 자막을 바로 번역하고 있습니다. 미리 번역하려면 플레이어의 자막을 껐다가 다시 켜세요.",
    noVideo: "여기에는 자막을 번역할 동영상이 없습니다.",
    // Settings: subtitles start by themselves on every video.
    setting: "동영상 자막 번역",
    settingDescription:
      '자막이 있는 동영상은 모든 사이트에서 자동으로 각 줄 아래에 번역을 표시합니다. 동영상의 컨텍스트 메뉴에서 "자막 번역"을 선택하면 그 동영상만 끄거나 켤 수 있습니다. 이 설정이 꺼져 있어도 메뉴와 "이 페이지 번역"으로 자막을 번역할 수 있습니다.',
  },
};
