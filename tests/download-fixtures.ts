import { eventListeners, installChrome } from "./fake-chrome";

type Item = chrome.downloads.DownloadItem;

export const EXTENSION_ID = "oba-extension";

// A downloads API over items in memory. `download` makes an in-progress
// item; tests move it on with `update`, which fires onChanged.
export function downloadsBrowser() {
  installChrome();
  const items = new Map<number, Item>();
  const onChanged =
    eventListeners<(delta: chrome.downloads.DownloadDelta) => void>();
  const onCreated = eventListeners<(item: Item) => void>();
  const onErased = eventListeners<(id: number) => void>();
  const onDeterminingFilename = eventListeners();
  const requests: chrome.downloads.DownloadOptions[] = [];
  const canceled: number[] = [];
  const resumed: number[] = [];
  let nextId = 1;
  const add = (values: Partial<Item>) => {
    const item = {
      id: nextId++,
      url: "https://files.test/file.bin",
      finalUrl: "https://files.test/file.bin",
      referrer: "",
      filename: "",
      incognito: false,
      danger: "safe",
      mime: "application/octet-stream",
      startTime: new Date().toISOString(),
      state: "in_progress",
      paused: false,
      canResume: false,
      bytesReceived: 0,
      totalBytes: 0,
      fileSize: 0,
      exists: true,
      ...values,
    } as Item;
    items.set(item.id, item);
    onCreated.emit(item);
    return item;
  };
  const update = (id: number, values: Partial<Item>) => {
    items.set(id, { ...items.get(id)!, ...values });
    onChanged.emit({
      id,
      ...(values.state ? { state: { current: values.state } } : {}),
    });
  };
  const downloads = {
    async download(options: chrome.downloads.DownloadOptions) {
      requests.push(options);
      return add({
        url: options.url,
        finalUrl: options.url,
        byExtensionId: EXTENSION_ID,
      }).id;
    },
    async search(query: chrome.downloads.DownloadQuery) {
      let list = [...items.values()];
      if (query.id !== undefined)
        list = list.filter((item) => item.id === query.id);
      if (query.startedAfter)
        list = list.filter(
          (item) =>
            Date.parse(item.startTime) > Date.parse(query.startedAfter!),
        );
      if (query.query?.length)
        list = list.filter((item) =>
          query.query!.every((term) =>
            `${item.filename} ${item.url}`.includes(term),
          ),
        );
      if (query.orderBy?.[0] === "-startTime") list.reverse();
      return list.slice(0, query.limit || list.length);
    },
    async cancel(id: number) {
      canceled.push(id);
      update(id, { state: "interrupted", error: "USER_CANCELED" });
    },
    async resume(id: number) {
      resumed.push(id);
      update(id, { state: "in_progress", paused: false, error: undefined });
    },
    onChanged,
    onCreated,
    onErased,
    onDeterminingFilename,
  };
  Object.assign(chrome, {
    downloads,
    runtime: { id: EXTENSION_ID },
  });
  return { items, add, update, requests, canceled, resumed, downloads };
}

// A finished download of a PDF, changed by `values`.
export const downloadItem = (values: Partial<chrome.downloads.DownloadItem>) =>
  ({
    id: 3,
    url: "https://files.test/report.pdf",
    finalUrl: "https://files.test/report.pdf",
    referrer: "",
    filename: "/home/mara/Downloads/report.pdf",
    incognito: false,
    danger: "safe",
    mime: "application/pdf",
    startTime: "2026-10-14T10:00:00.000Z",
    state: "complete",
    paused: false,
    canResume: false,
    bytesReceived: 2_400_000,
    totalBytes: 2_400_000,
    fileSize: 2_400_000,
    exists: true,
    ...values,
  }) as chrome.downloads.DownloadItem;
