import type { RunContext } from "../tools/types";
import { downloadLine } from "./records";
import {
  claimDownload,
  DownloadsUnavailableError,
  markSeen,
  pageDownloadsSince,
  settleDownload,
} from "./tracker";

// A small file a click starts is usually done within this time.
const CLICK_DOWNLOAD_WAIT_MS = 3000;

// Downloads that the agent's steps on a page started since `since` (ms):
// they become this chat's, are waited on briefly, and are reported with
// the step, so the agent knows where the file went.
export async function downloadsStartedSince(
  run: Pick<RunContext, "chatId" | "parentChatId">,
  since: number,
  signal?: AbortSignal,
) {
  let items: chrome.downloads.DownloadItem[];
  try {
    items = await pageDownloadsSince(run, since);
  } catch (error) {
    if (error instanceof DownloadsUnavailableError) return [];
    throw error;
  }
  for (const item of items)
    await claimDownload(run, item.id, { url: item.url });
  const records = (
    await Promise.all(
      items.map((item) =>
        settleDownload(run, item.id, CLICK_DOWNLOAD_WAIT_MS, signal),
      ),
    )
  ).filter((record) => !!record);
  await markSeen(run, records);
  return records;
}

export function startedDownloadLines(
  records: Awaited<ReturnType<typeof downloadsStartedSince>>,
) {
  if (!records.length) return [];
  return [
    `Started ${records.length === 1 ? "a download" : `${records.length} downloads`}:`,
    ...records.map(downloadLine),
  ];
}
