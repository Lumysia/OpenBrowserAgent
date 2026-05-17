export const DEFAULT_MAX_TOOL_STEPS = 30;

export const AUTO_RETRY_IDLE_MS = 30_000;
export const AUTO_RETRY_POLL_MS = 1_000;
export const MAX_AUTO_RETRIES = 1;
export const BROWSER_TOOL_TIMEOUT_MS = 25_000;
export const TAB_LOAD_WAIT_TIMEOUT_MS = 15_000;
export const SYNC_WRITE_DEBOUNCE_MS = 10_000;
export const SYNC_MAX_BYTES_PER_ITEM = 7_500;

export const MODEL_TEMPERATURE = 0.3;
export const STREAM_CHUNK_DELAY_MS = 8;
export const POST_TEXT_CHUNK_SIZE = 24;
export const STREAM_RENDER_THROTTLE_MS = 80;

export const LOCAL_CHAT_TITLE_MAX_LENGTH = 42;
export const GENERATED_TITLE_MAX_LENGTH = 48;
export const QUICK_ACTION_TITLE_MAX_LENGTH = 48;
export const QUICK_ACTION_SOURCE_MAX_CHARS = 12_000;
export const GENERATED_TITLE_MAX_CJK_CHARS = 10;
export const GENERATED_TITLE_MAX_WORDS = 10;
export const MARKDOWN_FILENAME_MAX_LENGTH = 30;
export const IMAGE_FILENAME_MAX_LABEL_LENGTH = 40;
export const IMAGE_ALT_MAX_LENGTH = 50;
export const MAX_IMAGES_PER_DOWNLOAD = 80;
export const MAX_UPLOAD_FILE_BYTES = 50_000_000;
export const MAX_UPLOAD_TOTAL_BYTES = 200_000_000;

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
  quickActions: "/quick-actions",
} as const;

export const OPTIONS_HASH = {
  general: "#/",
  sync: "#/sync",
  providers: "#/providers",
  quickActions: "#/quick-actions",
} as const;

export function clampMaxToolSteps(value: number | undefined) {
  if (!Number.isFinite(value)) return DEFAULT_MAX_TOOL_STEPS;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.trunc(value || 0)));
}
