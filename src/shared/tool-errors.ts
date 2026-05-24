export const TOOL_ERROR = {
  noActiveWebTabFound: "NO_ACTIVE_WEB_TAB_FOUND",
  activeTabNotWebPage: "ACTIVE_TAB_NOT_WEB_PAGE",
  noTabIdsProvided: "NO_TAB_IDS_PROVIDED",
  tabNotFound: "TAB_NOT_FOUND",
  noGroupableNormalTabs: "NO_GROUPABLE_NORMAL_TABS",
  unknownTool: "UNKNOWN_TOOL",
  missingUrl: "MISSING_URL",
  unknownNavigationType: "UNKNOWN_NAVIGATION_TYPE",
  tabHasNoWindow: "TAB_HAS_NO_WINDOW",
  noTextProvided: "NO_TEXT_PROVIDED",
  timedOutWaitingForText: "TIMED_OUT_WAITING_FOR_TEXT",
  timedOutWaitingForSelector: "TIMED_OUT_WAITING_FOR_SELECTOR",
  timedOutWaitingForCondition: "TIMED_OUT_WAITING_FOR_CONDITION",
  elementNotTextInput: "ELEMENT_NOT_TEXT_INPUT",
  targetIdCannotBeFocused: "TARGET_ID_CANNOT_BE_FOCUSED",
  closeByTargetIdUnsupported: "CLOSE_BY_TARGET_ID_UNSUPPORTED",
  resizeByTargetIdUnsupported: "RESIZE_BY_TARGET_ID_UNSUPPORTED",
  elementNotFound: "ELEMENT_NOT_FOUND",
  elementHasNoClickableBox: "ELEMENT_HAS_NO_CLICKABLE_BOX",
  missingCode: "MISSING_CODE",
} as const;

export type ToolErrorCode = (typeof TOOL_ERROR)[keyof typeof TOOL_ERROR];
