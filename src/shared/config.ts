export const DEFAULT_MAX_TOOL_STEPS = 50;

export const AUTO_RETRY_IDLE_MS = 30_000;
export const AUTO_RETRY_POLL_MS = 1_000;
export const MS_PER_SECOND = 1_000;
export const MAX_AUTO_RETRIES = 1;
export const BROWSER_TOOL_TIMEOUT_MS = 25_000;
export const TAB_LOAD_WAIT_TIMEOUT_MS = 15_000;
export const SYNC_WRITE_DEBOUNCE_MS = 1_000;
export const CHAT_SYNC_WRITE_DEBOUNCE_MS = 5_000;
export const SYNC_SETTINGS_REFRESH_INTERVAL_MS = 5_000;
export const SYNC_REMOTE_REFRESH_INTERVAL_MS = 30_000;
export const CHAT_WRITE_DEBOUNCE_MS = 300;
export const CHAT_STREAM_WRITE_DEBOUNCE_MS = 1_500;
export const SYNC_MAX_BYTES_PER_ITEM = 7_500;

export const STREAM_RENDER_THROTTLE_MS = 80;
export const STREAM_REVEAL_MIN_STEP_DELAY_MS = 16;
export const STREAM_REVEAL_MAX_STEP_DELAY_MS = 52;
export const STREAM_REVEAL_BACKLOG_LARGE = 240;
export const STREAM_REVEAL_BACKLOG_MEDIUM = 120;
export const STREAM_REVEAL_BACKLOG_SMALL = 56;
export const STREAM_REVEAL_BACKLOG_TINY = 18;
export const STREAM_REVEAL_STEP_LARGE = 10;
export const STREAM_REVEAL_STEP_MEDIUM = 6;
export const STREAM_REVEAL_STEP_SMALL = 4;
export const STREAM_REVEAL_STEP_TINY = 2;
export const STREAM_REVEAL_MAX_PENDING_CHARS = 600;
export const AUTO_SCROLL_BOTTOM_THRESHOLD_PX = 140;
export const AUTO_SCROLL_STREAM_THROTTLE_MS = 180;
export const ESTIMATED_CHARS_PER_TOKEN = 4;

export const LOCAL_CHAT_TITLE_MAX_LENGTH = 42;
export const GENERATED_TITLE_MAX_LENGTH = 48;
export const SKILL_NAME_MAX_LENGTH = 64;
// The skill list in the system prompt: each description is cut at the first
// limit; past the second the Options page warns instead of dropping skills.
export const SKILL_DESCRIPTION_MAX_CHARS = 200;
export const SKILL_LISTING_MAX_CHARS = 6_000;
export const WORKSPACE_PATH_MAX_LENGTH = 160;
export const WORKSPACE_FILE_MAX_CHARS = 48_000;
export const WORKSPACE_TOTAL_MAX_CHARS = 96_000;
export const WORKSPACE_SEARCH_RESULT_MAX_CHARS = 12_000;
export const WORKSPACE_SEARCH_PREVIEW_MAX_CHARS = 300;
export const WORKSPACE_MEMORY_MAX_CHARS = 2_200;
export const WORKSPACE_USER_MAX_CHARS = 1_400;
export const GENERATED_TITLE_MAX_CJK_CHARS = 10;
export const GENERATED_TITLE_MAX_WORDS = 10;
export const MARKDOWN_FILENAME_MAX_LENGTH = 30;
export const IMAGE_FILENAME_MAX_LABEL_LENGTH = 40;
export const IMAGE_ALT_MAX_LENGTH = 50;
export const MAX_IMAGES_PER_DOWNLOAD = 80;
export const DEFAULT_SCREENSHOT_QUALITY = 35;
export const MAX_UPLOAD_FILE_BYTES = 50_000_000;
export const MAX_UPLOAD_TOTAL_BYTES = 200_000_000;
export const BINARY_STRING_CHUNK_SIZE = 0x8000;

export const SELECTED_ELEMENT_HTML_MAX_CHARS = 4_000;
export const TAB_CONTENT_MAX_CHARS = 12_000;

export const COPY_FEEDBACK_MS = 1_800;
export const QUICK_FEEDBACK_MS = 1_200;
export const LOCAL_SETUP_FEEDBACK_MS = 3_600;
export const TOOLTIP_DELAY_MS = 250;
export const BYTES_PER_KIB = 1024;
export const BYTES_PER_MIB = BYTES_PER_KIB * BYTES_PER_KIB;
export const ISO_DATE_LENGTH = 10;
export const RELATIVE_TIME_MINUTE_MS = 60_000;
export const SENT_TABS_PREVIEW_COUNT = 2;
export const SENT_ATTACHMENTS_PREVIEW_COUNT = 3;

export const OPTIONS_ROUTE = {
  general: "/",
  agents: "/agents",
  sync: "/sync",
  providers: "/providers",
  mcp: "/mcp",
  localExecutionBridges: "/local-execution-bridges",
  skills: "/skills",
  smartBar: "/smart-bar",
  contextMenu: "/context-menu",
  pageTranslate: "/page-translation",
  debug: "/debug",
} as const;

export const OPTIONS_HASH = {
  general: "#/",
  agents: "#/agents",
  sync: "#/sync",
  providers: "#/providers",
  mcp: "#/mcp",
  localExecutionBridges: "#/local-execution-bridges",
  skills: "#/skills",
  smartBar: "#/smart-bar",
  contextMenu: "#/context-menu",
  pageTranslate: "#/page-translation",
  debug: "#/debug",
} as const;

// The privacy policy's part on translation engines.
export const PRIVACY_POLICY_TRANSLATION_URL =
  "https://github.com/Lumysia/OpenBrowserAgent/blob/main/PRIVACY.md#translation-engines";

export function clampMaxToolSteps(value: number | undefined) {
  if (!Number.isFinite(value)) return DEFAULT_MAX_TOOL_STEPS;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.trunc(value || 0)));
}
