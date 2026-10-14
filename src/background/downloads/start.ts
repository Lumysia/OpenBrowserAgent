import { bytesToBase64 } from "../../shared/binary";
import { OFFSCREEN_MESSAGE } from "../../shared/offscreen";
import { getBrowserApi } from "../../shared/storage";
import { offscreenRequest } from "../offscreen";
import type { RunContext } from "../tools/types";
import { nameFromUrl, safeDownloadPath } from "./filenames";
import { claimDownload, downloadsApi } from "./tracker";

type Run = Pick<RunContext, "chatId" | "parentChatId">;

// A suggested name stays open this long for the browser to ask for it.
const NAME_SUGGESTION_MS = 30_000;
// A blob URL outlives its download at most this long.
const BLOB_URL_MAX_MS = 30 * 60 * 1000;

// Starts a download of `url` for this chat. `filename` and `folder` are
// relative to the Downloads folder. Without a filename the browser picks the
// name (Content-Disposition, the URL, the type), placed in `folder`.
// No saveAs: the browser's own "ask where to save" setting applies.
export async function startDownload(
  run: Run,
  request: { url: string; filename?: string; folder?: string },
  signal?: AbortSignal,
) {
  const api = downloadsApi();
  const { url, folder = "" } = request;
  const filename = request.filename?.trim();
  signal?.throwIfAborted();
  let id: number;
  if (filename) {
    id = await api.download({
      url,
      filename: safeDownloadPath(filename, folder),
      conflictAction: "uniquify",
    });
  } else if (folder.trim() && api.onDeterminingFilename) {
    id = await withFolderSuggestion(url, folder, () =>
      api.download({ url, conflictAction: "uniquify" }),
    );
  } else if (folder.trim()) {
    id = await api.download({
      url,
      filename: safeDownloadPath(nameFromUrl(url), folder),
      conflictAction: "uniquify",
    });
  } else {
    id = await api.download({ url, conflictAction: "uniquify" });
  }
  await claimDownload(run, id, { url, filename: request.filename });
  return id;
}

// Puts the name the browser chose for this extension's download of `url`
// into `folder` (Chrome's onDeterminingFilename). Other downloads keep
// their names.
async function withFolderSuggestion(
  url: string,
  folder: string,
  start: () => Promise<number>,
) {
  const api = getBrowserApi().downloads;
  const runtimeId = getBrowserApi().runtime.id;
  let matched = false;
  const listener = (
    item: chrome.downloads.DownloadItem,
    suggest: (suggestion?: chrome.downloads.FilenameSuggestion) => void,
  ) => {
    if (matched || item.byExtensionId !== runtimeId || item.url !== url) {
      suggest();
      return;
    }
    matched = true;
    suggest({
      filename: safeDownloadPath(item.filename, folder),
      conflictAction: "uniquify",
    });
    stop();
  };
  const stop = () => {
    clearTimeout(timer);
    api.onDeterminingFilename.removeListener(listener);
  };
  const timer = setTimeout(stop, NAME_SUGGESTION_MS);
  api.onDeterminingFilename.addListener(listener);
  try {
    return await start();
  } catch (error) {
    stop();
    throw error;
  }
}

// A URL the browser can download `blob` from. Background pages make one
// themselves; Chrome's service worker cannot, so the offscreen document
// holds it. Not data: URLs: Chrome caps URLs at 2 MB and Firefox refuses
// to download them.
async function blobUrl(blob: Blob) {
  if (typeof URL.createObjectURL === "function") {
    const url = URL.createObjectURL(blob);
    return { url, release: () => URL.revokeObjectURL(url) };
  }
  const url = await offscreenRequest<string>(
    {
      type: OFFSCREEN_MESSAGE.createBlobUrl,
      base64: bytesToBase64(new Uint8Array(await blob.arrayBuffer())),
      mimeType: blob.type,
    },
    "The file could not be prepared for download.",
  );
  return {
    url,
    release: () =>
      offscreenRequest(
        { type: OFFSCREEN_MESSAGE.revokeBlobUrl, url },
        "",
      ).catch(() => undefined),
  };
}

// Saves bytes the agent has as a file in the Downloads folder.
export async function saveFile(
  run: Run,
  file: { blob: Blob; path: string },
  signal?: AbortSignal,
) {
  const api = downloadsApi();
  signal?.throwIfAborted();
  const { url, release } = await blobUrl(file.blob);
  let id: number;
  try {
    signal?.throwIfAborted();
    id = await api.download({
      url,
      filename: file.path,
      conflictAction: "uniquify",
    });
  } catch (error) {
    release();
    throw error;
  }
  releaseWhenDone(id, release);
  await claimDownload(run, id, { filename: file.path });
  return id;
}

// Frees a blob URL once its download no longer needs it.
function releaseWhenDone(id: number, release: () => void) {
  const api = getBrowserApi().downloads;
  let released = false;
  const finish = () => {
    if (released) return;
    released = true;
    clearTimeout(timer);
    api.onChanged?.removeListener(changed);
    api.onErased?.removeListener(erased);
    release();
  };
  const changed = (delta: chrome.downloads.DownloadDelta) => {
    if (delta.id !== id) return;
    const state = delta.state?.current;
    if (state === "complete" || state === "interrupted") finish();
  };
  const erased = (erasedId: number) => {
    if (erasedId === id) finish();
  };
  const timer = setTimeout(finish, BLOB_URL_MAX_MS);
  api.onChanged?.addListener(changed);
  api.onErased?.addListener(erased);
  // A small file may have finished before the listeners were added.
  api
    .search({ id })
    .then(([item]) => {
      if (!item || item.state !== "in_progress") finish();
    })
    .catch(() => undefined);
}
