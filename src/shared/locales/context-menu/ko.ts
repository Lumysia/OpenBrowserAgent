import type { ContextMenuLocaleMessages } from "./en-US";

export const contextMenuKo: ContextMenuLocaleMessages = {
  items: {
    ask: "이 페이지에 대해 질문하거나 작업 요청",
    summarizePage: "이 페이지 요약",
    searchPage: "이 페이지 관련 정보 웹 검색",
    searchSelection: '"%s" 웹 검색',
    summarizeLink: "링크된 페이지 요약",
    copyMarkdown: "Markdown으로 복사",
  },
  searchSelectionRequest: "선택한 텍스트 관련 정보 웹 검색",
  copied: "Markdown으로 복사했습니다",
  copyFailed:
    "클립보드에 복사하지 못했습니다. 페이지를 클릭한 후 다시 시도하세요.",
  copyUnavailable:
    "이 페이지는 복사할 수 없습니다. 브라우저가 확장 프로그램의 읽기를 허용하지 않습니다.",
  settingsTitle: "컨텍스트 메뉴",
  settingsDescription:
    "페이지를 마우스 오른쪽 버튼으로 클릭할 때 메뉴에 표시되는 OpenBrowserAgent 작업입니다.",
  enable: "컨텍스트 메뉴에 표시",
  enableDescription:
    "페이지, 링크, 이미지, 선택한 텍스트를 마우스 오른쪽 버튼으로 클릭하면 OpenBrowserAgent 하위 메뉴가 표시됩니다.",
  itemsTitle: "메뉴 항목",
  itemsDescription:
    "사이드 패널을 여는 작업은 페이지를 에이전트에 전달합니다. 'Markdown으로 복사'는 AI를 사용하지 않습니다.",
  itemLabels: {
    ask: "이 페이지에 대해 질문하거나 작업 요청",
    summarizePage: "이 페이지 요약",
    searchWeb: "이 페이지 또는 선택한 텍스트 관련 정보 웹 검색",
    summarizeLink: "링크된 페이지 요약(링크에서)",
    copyMarkdown: "Markdown으로 복사",
  },
};
