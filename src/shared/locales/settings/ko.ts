import type { SettingsMessages } from "./en-US";

export const settingsKo: SettingsMessages = {
  providersModels: "AI 제공업체 및 모델",
  agentsSkills: "에이전트 및 스킬",
  onPages: "페이지 기능",
  advanced: "고급",
  translate: "번역",
  rightClick: "오른쪽 클릭 메뉴",
  troubleshooting: "문제 해결",
  shortcuts: "키보드 단축키",
  shortcutsDescription:
    "OpenBrowserAgent 명령의 단축키입니다. 브라우저가 관리하므로 브라우저의 단축키 설정에서 변경하세요.",
  shortcutNone: "설정 안 됨",
  changeShortcuts: "단축키 변경",
  shortcutsFirefoxHint:
    '변경하려면 about:addons를 열고 톱니바퀴 버튼을 클릭한 뒤 "확장 기능 단축키 관리"를 선택하세요.',
  openMenuCommand: "메뉴 열기",
  openSidePanelCommand: "사이드 패널 열기",
  smartBarCommand: "선택한 텍스트에 스마트 바 표시",
  translatePageCommand: "이 페이지 번역 또는 원문 보기",
  sidePanelShortcutHint:
    "브라우저의 단축키 설정에서 키를 고르세요(예: {keys}).",
  // One command's keys, with a button to change them.
  commandShortcut: {
    // {shortcut}: the keys, as the browser shows them.
    current: "단축키: {shortcut}",
    none: "설정된 단축키가 없습니다",
    change: "단축키 변경",
  },
  chatBehavior: "채팅 동작",
  chatBehaviorDescription:
    "사이드 패널의 스크롤, 재시도, 도구 단계 수와 기념일 장식.",
  models: "모델",
  modelsDescription:
    "각 기능이 사용하는 모델입니다. 다른 모델을 고르지 않으면 채팅 모델을 사용합니다.",
  modelChat: "채팅",
  modelHelper: "보조",
  modelSmartBar: "스마트 바",
  modelTranslation: "번역",
  modelTranslationFallback:
    "내장 번역기로 페이지를 번역할 수 없을 때 사용합니다.",
  modelTranslationUnavailable:
    "현재 페이지 번역 엔진: {engine}. AI 모델은 사용하지 않습니다. 번역 엔진은 페이지 번역 설정에서 변경할 수 있습니다.",
  modelImages: "이미지",
  translateMenuItems: "오른쪽 클릭 메뉴 항목",
  translateMenuItemsDescription:
    "오른쪽 클릭 메뉴의 번역 항목입니다. 메뉴 자체는 오른쪽 클릭 메뉴에서 켜거나 끕니다.",
};
