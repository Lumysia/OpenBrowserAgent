export const PROMPT_CONTEXT_TAG = {
  selectedTabs: "selected_tabs",
  currentTab: "current_tab",
  selectedElement: "selected_element",
} as const;

export const PROMPT_CONTEXT_TAGS = Object.values(PROMPT_CONTEXT_TAG);

export const PROMPT_BREAKDOWN_SEGMENT = {
  system: "system",
  user: "user",
  conversation: "conversation",
  tabs: "tabs",
  element: "element",
  skills: "skills",
  attachments: "attachments",
  tools: "tools",
  sources: "sources",
  other: "other",
} as const;
