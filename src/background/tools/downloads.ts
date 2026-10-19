import { SAVE_SOURCES_HELP } from "./source-handles";
import { clampInt, trimmedString } from "../../shared/values";
import {
  DOWNLOAD_ACTION,
  DOWNLOAD_STATUS,
  isFinishedDownload,
  type DownloadRecord,
} from "../../shared/downloads";
import { TOOL_NAME } from "../../shared/tool-names";
import {
  ContentError,
  fileFromContent,
  fileFromSource,
  type FileContent,
} from "../downloads/content";
import { safeDownloadPath, withExtension } from "../downloads/filenames";
import { tabImagesZip } from "../downloads/images";
import { downloadLine } from "../downloads/records";
import { saveFile, startDownload } from "../downloads/start";
import {
  claimDownload,
  downloadOwner,
  downloadsApi,
  DownloadsUnavailableError,
  findRecord,
  markSeen,
  recordsFor,
  settleDownload,
  unseenDownload,
} from "../downloads/tracker";
import { pageTab } from "../page-agent";
import { RUN_TAB_ID_PARAM } from "../run-tab";
import {
  fail,
  schema,
  type RunContext,
  type ToolDefinition,
  type ToolResult,
} from "./types";

const START_WAIT_SECONDS = 30;
const WAIT_SECONDS = 60;
const MAX_WAIT_SECONDS = 600;
const LIST_LIMIT = 10;
const MAX_LIST_LIMIT = 50;

function seconds(value: unknown, fallback: number) {
  const number = Number(value);
  return (
    Math.min(
      MAX_WAIT_SECONDS,
      Math.max(0, Number.isFinite(number) ? number : fallback),
    ) * 1000
  );
}

function idArg(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id >= 0 ? id : undefined;
}

// The outcome of the records, told to the model and stored for the side
// panel. A failed download is a result, not a failed tool call.
async function outcome(
  run: RunContext,
  action: string,
  records: DownloadRecord[],
  lines: string[] = [],
  extra: Record<string, unknown> = {},
): Promise<ToolResult> {
  await markSeen(run, records);
  const readable = records.some(
    (record) =>
      record.status === DOWNLOAD_STATUS.completed &&
      !record.warning &&
      /^https?:/.test(record.url || ""),
  );
  return {
    text: [
      ...lines,
      ...records.map(downloadLine),
      ...(readable
        ? ["To read a downloaded file's content, use read with its URL."]
        : []),
    ].join("\n"),
    details: { action, downloads: records, ...extra },
  };
}

async function started(
  run: RunContext,
  action: string,
  id: number,
  input: Record<string, unknown>,
  signal?: AbortSignal,
  extra: Record<string, unknown> = {},
) {
  const record = await settleDownload(
    run,
    id,
    seconds(input.timeoutSeconds, START_WAIT_SECONDS),
    signal,
  );
  if (!record) return fail(`Download ${id} disappeared from the browser.`);
  return outcome(run, action, [record], [], extra);
}

async function save(
  run: RunContext,
  file: FileContent,
  input: Record<string, unknown>,
  signal?: AbortSignal,
  extra: Record<string, unknown> = {},
) {
  const filename = trimmedString(input.filename);
  const path = safeDownloadPath(
    filename ? withExtension(filename, file.blob.type) : file.name,
    trimmedString(input.folder),
  );
  const id = await saveFile(run, { blob: file.blob, path }, signal);
  return started(run, trimmedString(input.action), id, input, signal, extra);
}

// Downloads this chat started; others are the user's to manage.
async function ownRecord(run: RunContext, input: Record<string, unknown>) {
  const id = idArg(input.id);
  if (id === undefined) return { error: fail("id is required.") };
  const record = await findRecord(run, id);
  if (!record) return { error: fail(`No download with id ${id}.`) };
  if (!record.mine)
    return {
      error: fail(
        `Download ${id} was not started by you in this chat; only the user can change it, in the browser's downloads list.`,
      ),
    };
  return { record };
}

const ACTIONS: Record<
  string,
  (
    input: Record<string, unknown>,
    run: RunContext,
    signal?: AbortSignal,
  ) => Promise<ToolResult>
> = {
  async [DOWNLOAD_ACTION.download](input, run, signal) {
    const url = trimmedString(input.url);
    if (!/^https?:\/\//i.test(url))
      return fail("url must be an http or https URL of the file.");
    const id = await startDownload(
      run,
      {
        url,
        filename: trimmedString(input.filename),
        folder: trimmedString(input.folder),
      },
      signal,
    );
    return started(run, DOWNLOAD_ACTION.download, id, input, signal);
  },
  async [DOWNLOAD_ACTION.save](input, run, signal) {
    const source = trimmedString(input.source);
    if (typeof input.content === "string" && input.content)
      return save(
        run,
        fileFromContent({
          content: input.content,
          filename: trimmedString(input.filename),
          mimeType: trimmedString(input.mimeType),
          encoding: trimmedString(input.encoding),
        }),
        input,
        signal,
      );
    if (!source) return fail("Pass content (with a filename) or a source.");
    return save(run, await fileFromSource(run, source, signal), input, signal);
  },
  async [DOWNLOAD_ACTION.images](input, run, signal) {
    const tab = await pageTab(run.tab, input.tabId);
    const zip = await tabImagesZip(tab.id, signal);
    const counts = {
      tabId: tab.id,
      totalFound: zip.totalFound,
      downloadedCount: zip.downloadedCount,
    };
    if (!zip.file)
      return fail(
        zip.totalFound
          ? `Found ${zip.totalFound} images, but the site let none be fetched. Nothing was saved.`
          : "No images found on the page. Nothing was saved.",
        counts,
      );
    return save(run, zip.file, input, signal, counts);
  },
  async [DOWNLOAD_ACTION.list](input, run) {
    const query = trimmedString(input.query);
    const limit = clampInt(input.limit, {
      fallback: LIST_LIMIT,
      min: 1,
      max: MAX_LIST_LIMIT,
    });
    const items = await downloadsApi().search({
      orderBy: ["-startTime"],
      limit,
      ...(query ? { query: [query] } : {}),
    });
    const records = await recordsFor(run, items);
    return outcome(
      run,
      DOWNLOAD_ACTION.list,
      records,
      [
        records.length
          ? `${records.length} most recent downloads:`
          : "No downloads found.",
      ],
      { count: records.length },
    );
  },
  async [DOWNLOAD_ACTION.wait](input, run, signal) {
    const timeout = seconds(input.timeoutSeconds, WAIT_SECONDS);
    const end = Date.now() + timeout;
    let id = idArg(input.id);
    if (id === undefined) {
      const item = await unseenDownload(run, timeout, signal);
      if (!item)
        return outcome(
          run,
          DOWNLOAD_ACTION.wait,
          [],
          [
            `No download started within ${timeout / 1000} s. If a click should have started one, check the page (it may need another step or show an error), or download the file's URL directly.`,
          ],
        );
      id = item.id;
      // A page download the agent waited for is one it started.
      if (!(await downloadOwner(id))?.chat)
        await claimDownload(run, id, { url: item.url });
    }
    const record = await settleDownload(
      run,
      id,
      Math.max(0, end - Date.now()),
      signal,
    );
    if (!record) return fail(`No download with id ${id}.`);
    return outcome(run, DOWNLOAD_ACTION.wait, [record]);
  },
  async [DOWNLOAD_ACTION.cancel](input, run) {
    const { record, error } = await ownRecord(run, input);
    if (error) return error;
    if (isFinishedDownload(record.status))
      return outcome(
        run,
        DOWNLOAD_ACTION.cancel,
        [record],
        ["Nothing to cancel: it already ended."],
      );
    await downloadsApi().cancel(record.id);
    const after = (await findRecord(run, record.id)) || record;
    return outcome(run, DOWNLOAD_ACTION.cancel, [after]);
  },
  async [DOWNLOAD_ACTION.retry](input, run, signal) {
    const { record, error } = await ownRecord(run, input);
    if (error) return error;
    const api = downloadsApi();
    const [item] = await api.search({ id: record.id });
    if (record.status === DOWNLOAD_STATUS.completed)
      return outcome(
        run,
        DOWNLOAD_ACTION.retry,
        [record],
        ["Nothing to retry: it completed."],
      );
    if (item?.canResume) {
      await api.resume(record.id);
      return started(run, DOWNLOAD_ACTION.retry, record.id, input, signal);
    }
    if (!isFinishedDownload(record.status))
      return outcome(
        run,
        DOWNLOAD_ACTION.retry,
        [record],
        ["It is still running; wait for it, or cancel it first."],
      );
    const entry = await downloadOwner(record.id);
    const url = entry?.url || item?.url || "";
    if (!/^https?:/i.test(url))
      return fail(
        entry?.filename && !entry.url
          ? "This file was saved from content; save it again."
          : "This download came from a page script or form; start it again on the page.",
      );
    const id = await startDownload(
      run,
      { url, filename: entry?.filename },
      signal,
    );
    return started(run, DOWNLOAD_ACTION.retry, id, input, signal, {
      retriedId: record.id,
    });
  },
};

export const downloadsTool: ToolDefinition = {
  name: TOOL_NAME.downloads,
  effects: "act",
  group: "browser",
  onDemand: true,
  timeoutMs: (MAX_WAIT_SECONDS + 60) * 1000,
  summary:
    "Download files from URLs, save text or files you have to the user's device, and check, wait for, cancel or retry downloads",
  description: `Files on the user's device, in their Downloads folder. Each result states the outcome: completed (with the saved path and size), failed (with the reason), still downloading, held by the browser for the user to confirm, or waiting for the user in the browser's Save dialog. Tell the user a file is saved only once it is completed, and give its path.
- download: url (http/https; the browser's cookies apply, redirects are followed). Without filename the server's name is kept. Use this when you know the file's URL; a PDF that opens in a tab is not saved until you download its URL.
- save: a file from content you write (filename with extension; encoding base64 for bytes) or from source: ${SAVE_SOURCES_HELP} (also generated images).
- images: the tab's images as a zip.
- list: recent downloads (query filters by name or URL).
- wait: by id; without id, the latest download a click started that you have not seen finish, or the next one to start (click with act first, then wait).
- cancel, retry: a download you started (retry resumes or starts it again).
filename and folder are relative to the Downloads folder. Started downloads are waited on for timeoutSeconds (default ${START_WAIT_SECONDS}; wait: ${WAIT_SECONDS}).`,
  parameters: schema(
    {
      action: { type: "string", enum: Object.values(DOWNLOAD_ACTION) },
      url: { type: "string" },
      source: { type: "string" },
      content: { type: "string" },
      encoding: { type: "string", enum: ["text", "base64"] },
      mimeType: { type: "string" },
      filename: {
        type: "string",
        description: "Like report.csv; may include subfolders.",
      },
      folder: { type: "string", description: "Subfolder of Downloads." },
      tabId: RUN_TAB_ID_PARAM,
      id: { type: "number", description: "A download id from a result." },
      query: { type: "string" },
      limit: { type: "number" },
      timeoutSeconds: { type: "number" },
    },
    ["action"],
  ),
  compactArgs: true,
  async execute(input, { run, signal }) {
    const action = ACTIONS[trimmedString(input.action)];
    if (!action)
      return fail(
        `action must be one of ${Object.values(DOWNLOAD_ACTION).join(", ")}.`,
      );
    try {
      downloadsApi();
      return await action(input, run, signal);
    } catch (error) {
      signal?.throwIfAborted();
      if (error instanceof DownloadsUnavailableError)
        return fail(error.message);
      if (error instanceof ContentError) return fail(error.message);
      if (error instanceof Error && /filename/i.test(error.message))
        return fail(
          `The browser rejected the file name: ${error.message}. Use a plain name like report.pdf.`,
        );
      throw error;
    }
  },
};
