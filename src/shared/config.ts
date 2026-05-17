export const DEFAULT_MAX_TOOL_STEPS = 30;

export const AUTO_RETRY_IDLE_MS = 30_000;
export const MAX_AUTO_RETRIES = 1;
export const BROWSER_TOOL_TIMEOUT_MS = 25_000;
export const SYNC_WRITE_DEBOUNCE_MS = 2_000;

export const MODEL_TEMPERATURE = 0.3;
export const STREAM_CHUNK_DELAY_MS = 8;

export const LOCAL_CHAT_TITLE_MAX_LENGTH = 42;
export const GENERATED_TITLE_MAX_LENGTH = 48;
export const MARKDOWN_FILENAME_MAX_LENGTH = 30;
export const IMAGE_FILENAME_MAX_LABEL_LENGTH = 40;
export const IMAGE_ALT_MAX_LENGTH = 50;
export const MAX_IMAGES_PER_DOWNLOAD = 80;

export const SELECTED_ELEMENT_HTML_MAX_CHARS = 4_000;
export const TAB_CONTENT_MAX_CHARS = 12_000;

export const COPY_FEEDBACK_MS = 1_800;
export const QUICK_FEEDBACK_MS = 1_200;

export function clampMaxToolSteps(value: number | undefined) {
  if (!Number.isFinite(value)) return DEFAULT_MAX_TOOL_STEPS;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.trunc(value || 0)));
}
