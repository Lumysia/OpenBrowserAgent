export const DEFAULT_MAX_TOOL_STEPS = 50;

export const AUTO_RETRY_IDLE_MS = 30_000;
export const AUTO_RETRY_POLL_MS = 1_000;
export const MAX_AUTO_RETRIES = 1;
export const BROWSER_TOOL_TIMEOUT_MS = 25_000;
export const TAB_LOAD_WAIT_TIMEOUT_MS = 15_000;
export const BROWSER_WAIT_DEFAULT_MS = 1_000;
export const BROWSER_WAIT_MAX_MS = 60_000;
export const SYNC_WRITE_DEBOUNCE_MS = 10_000;
export const SYNC_MAX_BYTES_PER_ITEM = 7_500;

export const MODEL_TEMPERATURE = 0.3;
export const STREAM_CHUNK_DELAY_MS = 8;
export const POST_TEXT_CHUNK_SIZE = 24;
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
export const ESTIMATED_CHARS_PER_TOKEN = 4;
export const DEFAULT_CONTEXT_BUDGET_ENABLED = true;
export const DEFAULT_CONTEXT_REQUEST_MAX_CHARS = 96_000;
export const DEFAULT_CONTEXT_TAIL_MIN_MESSAGES = 8;
export const DEFAULT_CONTEXT_TAIL_MAX_CHARS = 40_000;
export const DEFAULT_CONTEXT_TOOL_RESULT_MAX_CHARS = 12_000;
export const DEFAULT_CONTEXT_TOOL_RESULT_AGGREGATE_MAX_CHARS = 48_000;
export const CONTEXT_TOOL_RESULT_KEEP_RECENT = 4;
export const CONTEXT_PRUNED_PREVIEW_CHARS = 240;
export const DEFAULT_CONTEXT_BUDGET_PREFERENCES = {
  contextBudgetEnabled: DEFAULT_CONTEXT_BUDGET_ENABLED,
  contextRequestMaxChars: DEFAULT_CONTEXT_REQUEST_MAX_CHARS,
  contextTailMinMessages: DEFAULT_CONTEXT_TAIL_MIN_MESSAGES,
  contextToolResultMaxChars: DEFAULT_CONTEXT_TOOL_RESULT_MAX_CHARS,
};

export const LOCAL_CHAT_TITLE_MAX_LENGTH = 42;
export const GENERATED_TITLE_MAX_LENGTH = 48;
export const SKILL_NAME_MAX_LENGTH = 64;
export const SKILL_SOURCE_MAX_CHARS = 12_000;
export const GENERATED_TITLE_MAX_CJK_CHARS = 10;
export const GENERATED_TITLE_MAX_WORDS = 10;
export const MARKDOWN_FILENAME_MAX_LENGTH = 30;
export const IMAGE_FILENAME_MAX_LABEL_LENGTH = 40;
export const IMAGE_ALT_MAX_LENGTH = 50;
export const MAX_IMAGES_PER_DOWNLOAD = 80;
export const MAX_UPLOAD_FILE_BYTES = 50_000_000;
export const MAX_UPLOAD_TOTAL_BYTES = 200_000_000;
export const READ_ATTACHMENT_DEFAULT_LIMIT = 24_000;
export const READ_ATTACHMENT_MAX_LIMIT = 96_000;

export const SELECTED_ELEMENT_HTML_MAX_CHARS = 4_000;
export const TAB_CONTENT_MAX_CHARS = 12_000;

export const COPY_FEEDBACK_MS = 1_800;
export const QUICK_FEEDBACK_MS = 1_200;
export const ISO_DATE_LENGTH = 10;
export const RELATIVE_TIME_MINUTE_MS = 60_000;
export const SENT_TABS_PREVIEW_COUNT = 2;
export const SENT_ATTACHMENTS_PREVIEW_COUNT = 3;

export const OPTIONS_ROUTE = {
  general: "/",
  sync: "/sync",
  providers: "/providers",
  skills: "/skills",
  debug: "/debug",
} as const;

export const OPTIONS_HASH = {
  general: "#/",
  sync: "#/sync",
  providers: "#/providers",
  skills: "#/skills",
  debug: "#/debug",
} as const;

export function clampMaxToolSteps(value: number | undefined) {
  if (!Number.isFinite(value)) return DEFAULT_MAX_TOOL_STEPS;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.trunc(value || 0)));
}
