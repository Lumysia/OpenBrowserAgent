import JSZip from "jszip";
import {
  IMAGE_ALT_MAX_LENGTH,
  IMAGE_FILENAME_MAX_LABEL_LENGTH,
  MAX_IMAGES_PER_DOWNLOAD,
} from "../shared/config";
import { getBrowserApi } from "../shared/storage";
import { abortable } from "../shared/cancellation";

export async function findImages(tabId: number, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const api = getBrowserApi();
  const tab = await api.tabs.get(tabId);
  signal?.throwIfAborted();
  const [result] = await api.scripting.executeScript({
    target: { tabId },
    args: [IMAGE_ALT_MAX_LENGTH],
    func: (altMaxLength) => {
      const seen = new Set<string>();
      const images: Array<{
        src: string;
        alt: string;
        index: number;
        type: string;
      }> = [];
      let index = 0;
      for (const img of Array.from(document.querySelectorAll("img"))) {
        if (
          !img.src ||
          !img.src.startsWith("http") ||
          img.src.startsWith("data:") ||
          img.src.startsWith("blob:") ||
          !img.complete ||
          img.naturalWidth <= 0 ||
          img.naturalHeight <= 0 ||
          seen.has(img.src)
        )
          continue;
        seen.add(img.src);
        images.push({
          src: img.src,
          alt: img.alt || `img-${index}`,
          index: index++,
          type: "img",
        });
      }
      const selectors = [
        "div",
        "section",
        "header",
        "footer",
        "article",
        "aside",
        "main",
        ".hero",
        ".banner",
        ".background",
        ".cover",
        ".image",
        '[style*="background"]',
        '[class*="bg-"]',
        '[class*="background"]',
      ];
      for (const element of Array.from(
        document.querySelectorAll(selectors.join(",")),
      ) as HTMLElement[]) {
        const backgroundImage = getComputedStyle(element).backgroundImage;
        const match = backgroundImage?.match(/url\(['"]?([^'"]*?)['"]?\)/);
        if (!match?.[1]) continue;
        let src = match[1];
        if (src.startsWith("/")) src = window.location.origin + src;
        else if (!src.startsWith("http"))
          src = new URL(src, window.location.href).href;
        if (src.startsWith("data:") || src.startsWith("blob:") || seen.has(src))
          continue;
        seen.add(src);
        const label =
          element.getAttribute("aria-label") ||
          element.getAttribute("title") ||
          element.classList[0] ||
          element.tagName.toLowerCase();
        images.push({
          src,
          alt: `bg-${label}-${index}`.slice(0, altMaxLength),
          index: index++,
          type: "background",
        });
      }
      return images;
    },
  });
  const images = result.result || [];
  const filename = `${safeFileName(tab.title || tab.url || "tab")}_images.zip`;
  const zip = new JSZip();
  let downloadedCount = 0;
  for (const image of images.slice(0, MAX_IMAGES_PER_DOWNLOAD)) {
    signal?.throwIfAborted();
    try {
      const response = await fetch(image.src, { signal });
      if (!response.ok) continue;
      const bytes = await response.arrayBuffer();
      signal?.throwIfAborted();
      const extension = imageExtension(
        response.headers.get("content-type"),
        image.src,
      );
      zip.file(
        `${String(image.index + 1).padStart(3, "0")}_${safeFileName(image.alt || image.type || "image").slice(0, IMAGE_FILENAME_MAX_LABEL_LENGTH)}.${extension}`,
        bytes,
      );
      downloadedCount += 1;
    } catch {
      signal?.throwIfAborted();
      // Some sites block image fetches; keep going and zip the images we can access.
    }
  }
  if (downloadedCount > 0) {
    signal?.throwIfAborted();
    const base64 = await generateZipBase64(zip, signal);
    await downloadFile(
      {
        url: `data:application/zip;base64,${base64}`,
        filename,
        saveAs: false,
      },
      signal,
    );
  }
  return {
    success: downloadedCount > 0,
    totalFound: images.length,
    downloadedCount,
    filename,
  };
}

export function safeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_");
}

export async function generateZipBase64(zip: JSZip, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const stream = zip.generateInternalStream({
    type: "base64",
    streamFiles: true,
  });
  const abort = () => {
    stream.pause();
  };
  signal?.addEventListener("abort", abort, { once: true });
  // JSZip schedules resume asynchronously. Also pause at the first chunk if
  // abort happened before that resume ran. Throwing from onUpdate would escape
  // JSZip's promise and does not reliably stop its worker chain.
  stream.on("data", () => {
    if (signal?.aborted) stream.pause();
  });
  try {
    return await abortable(stream.accumulate(), signal);
  } finally {
    signal?.removeEventListener("abort", abort);
  }
}

export async function downloadTextFile(
  filename: string,
  content: string,
  mimeType: string,
  signal?: AbortSignal,
) {
  return downloadFile(
    {
      url: `data:${mimeType},${encodeURIComponent(content)}`,
      filename,
      saveAs: false,
    },
    signal,
  );
}

export async function downloadFile(
  options: chrome.downloads.DownloadOptions,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const api = getBrowserApi().downloads;
  // Keep observing creation even if the caller aborts before Chrome returns its ID.
  const id = await api.download(options);
  const cancel = () => api.cancel(id).catch(() => undefined);
  if (signal?.aborted) {
    await cancel();
    signal.throwIfAborted();
  }
  let listener: (delta: chrome.downloads.DownloadDelta) => void;
  const onAbort = () => {
    void cancel();
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    await abortable(
      new Promise<void>((resolve, reject) => {
        const check = (state?: string, error?: string) => {
          if (state === "complete") resolve();
          if (state === "interrupted" || error)
            reject(new Error(error || "Download interrupted"));
        };
        listener = (delta) => {
          if (delta.id === id)
            check(delta.state?.current, delta.error?.current);
        };
        api.onChanged.addListener(listener);
        api.search({ id }).then(([item]) => {
          if (!item) reject(new Error("Download not found"));
          else check(item.state, item.error);
        }, reject);
      }),
      signal,
    );
    return id;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    api.onChanged.removeListener(listener!);
  }
}

function imageExtension(contentType: string | null, url: string) {
  const fromType = contentType
    ?.split("/")[1]
    ?.split(";")[0]
    ?.replace("jpeg", "jpg")
    .replace("svg+xml", "svg");
  if (fromType && /^[a-z0-9]+$/i.test(fromType)) return fromType;
  const match = new URL(url).pathname.match(/\.([a-z0-9]{2,5})$/i);
  return match?.[1] || "jpg";
}
