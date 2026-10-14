import { formatBytesForModel } from "../../shared/format";
import {
  DOWNLOAD_STATUS,
  type DownloadRecord,
  type DownloadStatus,
} from "../../shared/downloads";
import { TOOL_NAME } from "../../shared/tool-names";
import { baseName, extensionOf, nameFromUrl } from "./filenames";

// With no file name after this long, the browser is waiting for its Save
// dialog rather than still choosing a name itself.
export const CHOOSING_LOCATION_AFTER_MS = 1500;
const URL_MAX_CHARS = 300;
const HTML_EXTENSION = /^(x?html?|mhtml?|shtml|php|aspx?|jsp)$/;

export const DOWNLOAD_WARNING = {
  // A web page (often a sign-in or error page) arrived instead of a file.
  htmlPage: "html_page",
} as const;

// Danger levels that do not hold a download back.
const HARMLESS_DANGER = new Set([
  "safe",
  "accepted",
  "allowlistedByPolicy",
  "deepScannedSafe",
  "deepScannedOpenedDangerous",
  "asyncScanning",
  "asyncLocalPasswordScanning",
]);
const SCANNING_DANGER = new Set([
  "asyncScanning",
  "asyncLocalPasswordScanning",
]);

// The browser's interrupt reasons in words a user understands.
const INTERRUPT_REASONS: Record<string, string> = {
  FILE_FAILED: "the file could not be written",
  FILE_ACCESS_DENIED: "the browser may not write to the download folder",
  FILE_NO_SPACE: "the disk is full",
  FILE_NAME_TOO_LONG: "the file name is too long",
  FILE_TOO_LARGE: "the file is too large for the disk",
  FILE_VIRUS_INFECTED: "the system's antivirus blocked it",
  FILE_TRANSIENT_ERROR: "a temporary file error; retrying may work",
  FILE_BLOCKED: "the browser or a policy blocked this file",
  FILE_SECURITY_CHECK_FAILED: "the browser's security check failed",
  FILE_TOO_SHORT: "the server sent less data than expected",
  FILE_HASH_MISMATCH: "the file changed while it downloaded",
  FILE_SAME_AS_SOURCE: "the file would overwrite its own source",
  NETWORK_FAILED: "the network connection failed",
  NETWORK_TIMEOUT: "the network timed out",
  NETWORK_DISCONNECTED: "the device went offline",
  NETWORK_SERVER_DOWN: "the server stopped responding during the download",
  NETWORK_INVALID_REQUEST:
    "the browser refused the request (blocked or invalid URL)",
  SERVER_FAILED: "the server failed or dropped the connection",
  SERVER_NO_RANGE: "the server cannot resume it; retry downloads it again",
  SERVER_BAD_CONTENT: "the server has no such file (for example HTTP 404)",
  SERVER_UNAUTHORIZED: "the server wants the user to sign in",
  SERVER_CERT_PROBLEM: "the server's certificate is not valid",
  SERVER_FORBIDDEN: "the server refused access (HTTP 403)",
  SERVER_UNREACHABLE: "the server could not be reached",
  SERVER_CONTENT_LENGTH_MISMATCH:
    "the server sent a different amount of data than it announced",
  SERVER_CROSS_ORIGIN_REDIRECT:
    "the server redirected to another site, which the browser does not follow for downloads",
  USER_CANCELED: "it was canceled",
  USER_SHUTDOWN: "the browser was closed",
  CRASH: "the browser crashed",
};

export function interruptReason(error: string) {
  return INTERRUPT_REASONS[error] || error.toLowerCase().replace(/_/g, " ");
}

function status(item: chrome.downloads.DownloadItem, now: number) {
  if (item.state === "complete") return DOWNLOAD_STATUS.completed;
  if (item.state === "interrupted")
    return item.error === "USER_CANCELED"
      ? DOWNLOAD_STATUS.canceled
      : DOWNLOAD_STATUS.failed;
  if (item.danger && !HARMLESS_DANGER.has(item.danger))
    return DOWNLOAD_STATUS.needsConfirmation;
  if (item.paused) return DOWNLOAD_STATUS.paused;
  if (
    !item.filename &&
    now - Date.parse(item.startTime) > CHOOSING_LOCATION_AFTER_MS
  )
    return DOWNLOAD_STATUS.choosingLocation;
  return DOWNLOAD_STATUS.inProgress;
}

// Long data: URLs say only what they hold.
function shortUrl(url: string | undefined) {
  if (!url) return undefined;
  if (url.startsWith("data:"))
    return `${url.slice(0, url.search(/[;,]/) + 1 || 40)}…`;
  return url.length > URL_MAX_CHARS ? `${url.slice(0, URL_MAX_CHARS)}…` : url;
}

const positive = (value: number | undefined) =>
  value !== undefined && value > 0 ? value : undefined;

export function downloadRecord(
  item: chrome.downloads.DownloadItem,
  options: { now?: number; mine?: boolean } = {},
): DownloadRecord {
  const now = options.now ?? Date.now();
  const current = status(item, now);
  const name =
    baseName(item.filename) ||
    nameFromUrl(item.finalUrl || item.url) ||
    "download";
  // A web page where the name or the URL promised another kind of file.
  const html =
    current === DOWNLOAD_STATUS.completed &&
    /^(text\/html|application\/xhtml\+xml)/i.test(item.mime || "") &&
    [name, nameFromUrl(item.finalUrl || item.url)].some((value) => {
      const extension = extensionOf(value);
      return !!extension && !HTML_EXTENSION.test(extension);
    });
  const record: DownloadRecord = {
    id: item.id,
    status: current,
    name,
    path: item.filename || undefined,
    url: shortUrl(item.url),
    finalUrl:
      item.finalUrl && item.finalUrl !== item.url
        ? shortUrl(item.finalUrl)
        : undefined,
    referrer: shortUrl(item.referrer) || undefined,
    mime: item.mime || undefined,
    bytes:
      current === DOWNLOAD_STATUS.completed
        ? (positive(item.fileSize) ?? item.bytesReceived)
        : positive(item.bytesReceived),
    totalBytes: positive(item.totalBytes),
    startTime: item.startTime,
    endTime: item.endTime,
    error: item.state === "interrupted" ? item.error : undefined,
    danger: item.danger && item.danger !== "safe" ? item.danger : undefined,
    exists: current === DOWNLOAD_STATUS.completed ? item.exists : undefined,
    mine: options.mine || undefined,
    warning: html ? DOWNLOAD_WARNING.htmlPage : undefined,
  };
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as DownloadRecord;
}

function progress(record: DownloadRecord) {
  const received = formatBytesForModel(record.bytes || 0);
  if (!record.totalBytes) return `${received} so far`;
  const percent = Math.floor(((record.bytes || 0) / record.totalBytes) * 100);
  return `${received} of ${formatBytesForModel(record.totalBytes)} (${percent}%)`;
}

const DETAIL: Record<DownloadStatus, (record: DownloadRecord) => string> = {
  [DOWNLOAD_STATUS.completed]: (record) =>
    record.exists === false
      ? `completed, but the file has since been moved or deleted (was at ${record.path})`
      : `completed, ${formatBytesForModel(record.bytes || 0)}${record.mime ? ` (${record.mime})` : ""}, saved at ${record.path}`,
  [DOWNLOAD_STATUS.failed]: (record) =>
    `failed: ${interruptReason(record.error || "")} [${record.error}]. Nothing usable was saved`,
  [DOWNLOAD_STATUS.canceled]: () => "canceled; nothing was saved",
  [DOWNLOAD_STATUS.inProgress]: (record) =>
    `still downloading, ${progress(record)}${record.danger && SCANNING_DANGER.has(record.danger) ? "; the browser is scanning it" : ""}. Call ${TOOL_NAME.downloads} wait with id ${record.id} before saying it is saved`,
  [DOWNLOAD_STATUS.paused]: (record) =>
    `paused at ${progress(record)}; retry resumes it`,
  [DOWNLOAD_STATUS.needsConfirmation]: (record) =>
    `held by the browser, which flagged it as possibly harmful (danger: ${record.danger}). It is not saved until the user chooses to keep it in the browser's downloads list; you cannot do that for them. Tell the user, and do not download it again`,
  [DOWNLOAD_STATUS.choosingLocation]: () =>
    "the browser's Save dialog is open: the user must choose where to save it. Tell them, then wait for it again",
};

const WARNING: Record<string, string> = {
  [DOWNLOAD_WARNING.htmlPage]:
    "Warning: the server sent a web page (text/html), not the file; it is probably a sign-in, error or landing page. Check it with read on the URL, or open the URL in a tab",
};

// One line the model reads: the outcome it must not guess.
export function downloadLine(record: DownloadRecord) {
  const from =
    record.url && !/^(blob|data):/.test(record.url)
      ? ` From ${record.finalUrl ? `${record.url} (redirected to ${record.finalUrl})` : record.url}.`
      : "";
  const warning = record.warning ? ` ${WARNING[record.warning]}.` : "";
  return `#${record.id} ${record.name}${record.mine ? "" : " (not started by you)"}: ${DETAIL[record.status](record)}.${warning}${from}`;
}
