import { delay } from "../../shared/cancellation";
import {
  isFinishedDownload,
  needsUserForDownload,
  type DownloadRecord,
} from "../../shared/downloads";
import { getBrowserApi } from "../../shared/storage";
import type { RunContext } from "../tools/types";
import { downloadRecord } from "./records";

// Which downloads each chat started (with the downloads tool or a click of
// the agent), and which outcomes each chat has already been told. The
// record lives in session storage and ends with the browser session, like
// download ids that are meaningful only on this device.

const AGENT_DOWNLOADS_KEY = "agentDownloads";
const ENTRY_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const POLL_MS = 1000;
// `wait` without an id looks this far back for a download to report.
export const RECENT_DOWNLOAD_MS = 2 * 60 * 1000;

export const DOWNLOADS_UNAVAILABLE =
  "This browser does not let extensions download files or see downloads (Safari has no downloads API). To get a file, open its URL in a tab with tabs so the browser downloads or shows it, or give the user the link.";

type Entry = {
  // The chat that started it.
  chat?: string;
  // Chats that were told its final outcome.
  seen?: string[];
  // What the downloads tool asked for, to start it again.
  url?: string;
  filename?: string;
  at: number;
};

type Run = Pick<RunContext, "chatId" | "parentChatId">;

const memory: Record<string, Entry> = {};
let queue: Promise<unknown> = Promise.resolve();

export class DownloadsUnavailableError extends Error {
  constructor() {
    super(DOWNLOADS_UNAVAILABLE);
  }
}

export function downloadsApi() {
  const downloads = getBrowserApi().downloads;
  if (!downloads?.download || !downloads.search)
    throw new DownloadsUnavailableError();
  return downloads;
}

// Sub-agents download for the chat that started them.
export function ownerChat(run: Run) {
  return run.parentChatId || run.chatId;
}

async function load(): Promise<Record<string, Entry>> {
  const area = getBrowserApi().storage.session;
  if (!area) return memory;
  return ((await area.get(AGENT_DOWNLOADS_KEY))[AGENT_DOWNLOADS_KEY] ||
    {}) as Record<string, Entry>;
}

function update(change: (entries: Record<string, Entry>) => void) {
  const task = async () => {
    const entries = await load();
    const now = Date.now();
    for (const [id, entry] of Object.entries(entries))
      if (now - entry.at > ENTRY_MAX_AGE_MS) delete entries[id];
    change(entries);
    await getBrowserApi().storage.session?.set({
      [AGENT_DOWNLOADS_KEY]: entries,
    });
  };
  const result = queue.then(task, task);
  queue = result.catch(() => undefined);
  return result;
}

export function claimDownload(
  run: Run,
  id: number,
  request: { url?: string; filename?: string } = {},
) {
  return update((entries) => {
    const entry = entries[id];
    entries[id] = {
      ...entry,
      ...request,
      chat: ownerChat(run),
      at: Date.now(),
    };
  });
}

export async function downloadOwner(id: number) {
  return (await load())[id];
}

// Remembers the finished outcomes a chat has been shown.
export function markSeen(run: Run, records: DownloadRecord[]) {
  const finished = records.filter((record) =>
    isFinishedDownload(record.status),
  );
  if (!finished.length) return Promise.resolve();
  const chat = ownerChat(run);
  return update((entries) => {
    for (const record of finished) {
      const entry = (entries[record.id] ||= { at: Date.now() });
      entry.seen = [...new Set([...(entry.seen || []), chat])];
    }
  });
}

export async function findRecord(run: Run, id: number) {
  const [item] = await downloadsApi().search({ id });
  if (!item) return undefined;
  const entry = await downloadOwner(id);
  return downloadRecord(item, { mine: entry?.chat === ownerChat(run) });
}

export async function recordsFor(
  run: Run,
  items: chrome.downloads.DownloadItem[],
) {
  const entries = await load();
  const chat = ownerChat(run);
  return items.map((item) =>
    downloadRecord(item, { mine: entries[item.id]?.chat === chat }),
  );
}

// Resolves on the next change event of the downloads API or after `ms`
// (at most POLL_MS: changes to progress have no event).
function nextChange(ms: number, signal?: AbortSignal) {
  const api = downloadsApi();
  return new Promise<void>((resolve, reject) => {
    const done = () => {
      api.onChanged?.removeListener(done);
      api.onCreated?.removeListener(done);
      signal?.removeEventListener("abort", aborted);
      resolve();
    };
    const aborted = () => {
      done();
      reject(signal?.reason);
    };
    api.onChanged?.addListener(done);
    api.onCreated?.addListener(done);
    signal?.addEventListener("abort", aborted, { once: true });
    delay(Math.max(0, Math.min(POLL_MS, ms)), signal).then(
      done,
      () => undefined,
    );
  });
}

// Waits until a download finishes, or until it starts needing the user (a
// Save dialog, a dangerous file). One that already needs the user when the
// wait begins is waited on until the user acts. Returns the latest record
// when `timeoutMs` passes first.
export async function settleDownload(
  run: Run,
  id: number,
  timeoutMs: number,
  signal?: AbortSignal,
) {
  const end = Date.now() + timeoutMs;
  let record = await findRecord(run, id);
  let waitingForUser = !!record && needsUserForDownload(record.status);
  while (record && Date.now() < end) {
    if (isFinishedDownload(record.status)) break;
    const needsUser = needsUserForDownload(record.status);
    if (needsUser && !waitingForUser) break;
    if (!needsUser) waitingForUser = false;
    await nextChange(end - Date.now(), signal);
    record = await findRecord(run, id);
  }
  return record;
}

// Downloads that pages started since `since` (ms), not by this extension
// and not claimed by another chat.
export async function pageDownloadsSince(run: Run, since: number) {
  const items = await downloadsApi().search({
    startedAfter: new Date(since).toISOString(),
    orderBy: ["startTime"],
  });
  const entries = await load();
  const chat = ownerChat(run);
  const runtimeId = getBrowserApi().runtime?.id;
  return items.filter(
    (item) =>
      !fromExtension(item, runtimeId) &&
      (!entries[item.id]?.chat || entries[item.id].chat === chat),
  );
}

// Started by this extension (the downloads tool or the side panel), not by
// a page.
function fromExtension(
  item: chrome.downloads.DownloadItem,
  runtimeId: string | undefined,
) {
  return !!item.byExtensionId && item.byExtensionId === runtimeId;
}

// The download `wait` without an id is about: the newest recent one from
// this chat or a page whose outcome this chat has not been told, else the
// next one that starts within `timeoutMs`.
export async function unseenDownload(
  run: Run,
  timeoutMs: number,
  signal?: AbortSignal,
) {
  const chat = ownerChat(run);
  const end = Date.now() + timeoutMs;
  const since = Date.now() - RECENT_DOWNLOAD_MS;
  const runtimeId = getBrowserApi().runtime?.id;
  while (true) {
    const [items, entries] = await Promise.all([
      downloadsApi().search({
        startedAfter: new Date(since).toISOString(),
        orderBy: ["-startTime"],
      }),
      load(),
    ]);
    const item = items.find((candidate) => {
      const entry = entries[candidate.id];
      if (entry?.chat && entry.chat !== chat) return false;
      if (entry?.seen?.includes(chat)) return false;
      return entry?.chat === chat || !fromExtension(candidate, runtimeId);
    });
    if (item || Date.now() >= end) return item;
    await nextChange(end - Date.now(), signal);
  }
}
