export const PRODUCT_NAME = "OpenBrowserAgent";

export const DEFAULT_MAX_TOOL_STEPS = 50;

export const AUTO_RETRY_IDLE_MS = 30_000;
export const AUTO_RETRY_POLL_MS = 1_000;
export const MS_PER_SECOND = 1_000;
export const MAX_AUTO_RETRIES = 1;
export const BROWSER_TOOL_TIMEOUT_MS = 25_000;
export const TAB_LOAD_WAIT_TIMEOUT_MS = 15_000;
export const CHAT_WRITE_DEBOUNCE_MS = 300;
export const CHAT_STREAM_WRITE_DEBOUNCE_MS = 1_500;

export const STREAM_RENDER_THROTTLE_MS = 80;
// How long a stopped run may take to report its last usage to the panel.
export const STREAM_STOP_SETTLE_MS = 10_000;
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
// How close to the bottom counts as "at the bottom" for following output.
export const AUTO_SCROLL_BOTTOM_THRESHOLD_PX = 48;
// Closer than this is exactly at the bottom (scroll positions round).
export const AUTO_SCROLL_AT_BOTTOM_PX = 2;
// A scroll up by less than this is rounding, not the reader moving.
export const AUTO_SCROLL_SUBPIXEL_PX = 1;
export const AUTO_SCROLL_STREAM_THROTTLE_MS = 180;
// Token estimates where no tokenizer runs, as Pi estimates them
// (pi-ai utils/estimate, whose constants are private): characters per
// token, and the characters an image counts as.
export const ESTIMATED_CHARS_PER_TOKEN = 3.5;
export const ESTIMATED_IMAGE_CHARS = 4_800;

// Page translation batches at once on one cloud endpoint (a provider type
// can set its own, see providers.ts).
export const QUICK_TASK_CONCURRENCY = 4;

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
// The shortest sync passphrase (it encrypts synced API keys).
export const SYNC_PASSPHRASE_MIN_LENGTH = 8;
// A skill's files together, held to the same size as a workspace's.
export const SKILL_MAX_CHARS = WORKSPACE_TOTAL_MAX_CHARS;
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
// Drawn Mermaid diagrams kept for re-renders and theme switches back.
export const MERMAID_RENDER_CACHE_SIZE = 40;
// A downloaded diagram PNG, in pixels per SVG unit.
export const MERMAID_PNG_SCALE = 2;
// Elements checked for CSS background images, so a huge page stays quick.
export const MAX_SCANNED_ELEMENTS_FOR_IMAGES = 20_000;
export const DEFAULT_SCREENSHOT_QUALITY = 35;
export const MAX_UPLOAD_FILE_BYTES = 50_000_000;
export const MAX_UPLOAD_TOTAL_BYTES = 200_000_000;
export const BINARY_STRING_CHUNK_SIZE = 0x8000;

export const SELECTED_ELEMENT_HTML_MAX_CHARS = 4_000;
export const TAB_CONTENT_MAX_CHARS = 12_000;
// What a chat keeps of a source a tool found.
export const SOURCE_TITLE_MAX_CHARS = 160;
export const SOURCE_SNIPPET_MAX_CHARS = 800;

export const COPY_FEEDBACK_MS = 1_800;
export const QUICK_FEEDBACK_MS = 1_200;

// How long a settings form waits after the last keystroke before it saves.
export const AUTO_SAVE_DELAY_MS = 400;
export const TOOLTIP_DELAY_MS = 250;
export const BYTES_PER_KIB = 1024;
export const BYTES_PER_MIB = BYTES_PER_KIB * BYTES_PER_KIB;

// The code sandbox (runCode tool).
export const CODE_RUN_LIMITS = {
  defaultTimeoutMs: 10_000,
  maxTimeoutMs: 30_000,
  minTimeoutMs: 100,
  memoryBytes: 128 * BYTES_PER_MIB,
  // The interpreter's own stack runs on the browser's, which is about 1 MB in
  // a Worker; deeper limits crash the Worker instead of raising RangeError.
  stackBytes: 256 * BYTES_PER_KIB,
  // What one run may hand back as console output, result and error together;
  // the model sees less (the run's tool output cap).
  outputMaxChars: 1_000_000,
  // The result and the error still show this much when console output used
  // the budget up.
  reportMinChars: 1_000,
  // Time the interpreter gets after the code's deadline to turn the result
  // or the error into text.
  reportMs: 500,
  // The host kills the Worker this long after the interpreter's deadline,
  // when an interrupt did not stop the code.
  watchdogGraceMs: 2_000,
  // How long the sandboxed page may take to load and compile the interpreter.
  frameReadyTimeoutMs: 15_000,
  // Extra time the host waits for the sandboxed page beyond the Worker's own
  // watchdog before it treats the page as dead.
  frameReplyGraceMs: 3_000,
  // Runs at once; more wait their turn (each has its own interpreter heap).
  maxConcurrent: 2,
} as const;
// Local execution bridge commands. The native host enforces the timeout it
// is sent, and has the same maximum (packages/local-execution-bridge).
export const LOCAL_EXECUTION_BRIDGE_LIMITS = {
  defaultTimeoutMs: 2 * 60_000,
  minTimeoutMs: 1_000,
  maxTimeoutMs: 30 * 60_000,
  // How long past the timeout the extension waits for the host to report it
  // before cancelling the task itself.
  timeoutGraceMs: 5_000,
  pingTimeoutMs: 5_000,
  // How long start waits so a command that fails at once says so.
  startSettleMs: 1_000,
} as const;
export const ISO_DATE_LENGTH = 10;
export const RELATIVE_TIME_MINUTE_MS = 60_000;
export const SENT_TABS_PREVIEW_COUNT = 2;
export const SENT_ATTACHMENTS_PREVIEW_COUNT = 3;

// The settings pages, in the sidebar's order, then the setup page.
export const OPTIONS_PAGE_ROUTE = {
  general: "/",
  providers: "/providers",
  agents: "/agents",
  onPages: "/on-pages",
  sync: "/sync",
  advanced: "/advanced",
  // First-run setup, opened on install; not in the sidebar.
  welcome: "/welcome",
} as const;

// Every place in settings: the pages, and the sub-pages inside them
// ("<page>/<sub-page>").
export const OPTIONS_ROUTE = {
  ...OPTIONS_PAGE_ROUTE,
  skills: `${OPTIONS_PAGE_ROUTE.agents}/skills`,
  pageTranslate: `${OPTIONS_PAGE_ROUTE.onPages}/translate`,
  smartBar: `${OPTIONS_PAGE_ROUTE.onPages}/smart-bar`,
  contextMenu: `${OPTIONS_PAGE_ROUTE.onPages}/right-click`,
  mcp: `${OPTIONS_PAGE_ROUTE.advanced}/mcp`,
  localExecutionBridges: `${OPTIONS_PAGE_ROUTE.advanced}/bridges`,
  debug: `${OPTIONS_PAGE_ROUTE.advanced}/troubleshooting`,
} as const;

// Routes of the pages before they were grouped, still opened by links and
// bookmarks.
const LEGACY_OPTIONS_ROUTE: Record<string, string> = {
  "/skills": OPTIONS_ROUTE.skills,
  "/page-translation": OPTIONS_ROUTE.pageTranslate,
  "/smart-bar": OPTIONS_ROUTE.smartBar,
  "/context-menu": OPTIONS_ROUTE.contextMenu,
  "/mcp": OPTIONS_ROUTE.mcp,
  "/local-execution-bridges": OPTIONS_ROUTE.localExecutionBridges,
  "/debug": OPTIONS_ROUTE.debug,
};

// The route a hash ("#/smart-bar") leads to: an older page's route becomes
// where that page is now; an empty hash is General.
export function resolveOptionsRoute(hash: string) {
  const route = hash.replace(/^#/, "") || OPTIONS_ROUTE.general;
  return LEGACY_OPTIONS_ROUTE[route] ?? route;
}

// The same routes as location hashes ("#/agents").
export const OPTIONS_HASH = Object.fromEntries(
  Object.entries(OPTIONS_ROUTE).map(([page, route]) => [page, `#${route}`]),
) as {
  [Page in keyof typeof OPTIONS_ROUTE]: `#${(typeof OPTIONS_ROUTE)[Page]}`;
};

// The project's source repository (help, privacy policy).
export const REPO_URL = "https://github.com/Lumysia/OpenBrowserAgent";

// The privacy policy's part on translation engines.
export const PRIVACY_POLICY_TRANSLATION_URL = `${REPO_URL}/blob/main/PRIVACY.md#translation-engines`;

export function clampMaxToolSteps(value: number | undefined) {
  if (!Number.isFinite(value)) return DEFAULT_MAX_TOOL_STEPS;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.trunc(value || 0)));
}

// Where Chromium browsers (Edge too) let the user change extension keyboard
// shortcuts. Firefox has no URL for it (see settings.shortcutsFirefoxHint).
export const BROWSER_SHORTCUTS_URL = "chrome://extensions/shortcuts";

// The suggested keys for the toolbar button (manifest `_execute_action`,
// which opens the side panel). Chrome sets no key at all when the suggestion
// is one it uses itself (Ctrl+J opens Downloads); Ctrl+Shift+Y is free in
// Chrome on Windows, Linux and macOS.
export const SIDE_PANEL_SHORTCUT = {
  default: "Ctrl+Shift+Y",
  mac: "Command+Shift+Y",
} as const;
