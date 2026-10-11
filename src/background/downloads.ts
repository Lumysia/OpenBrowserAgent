import JSZip from "jszip";
import {
  IMAGE_ALT_MAX_LENGTH,
  IMAGE_FILENAME_MAX_LABEL_LENGTH,
  MAX_IMAGES_PER_DOWNLOAD,
} from "../shared/config";
import { getBrowserApi } from "../shared/storage";

export async function findImages(tabId: number, signal?: AbortSignal) {
  const api = getBrowserApi();
  const tab = await api.tabs.get(tabId);
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
      // Some sites block image fetches; keep going and zip the images we can access.
    }
  }
  if (downloadedCount > 0) {
    const base64 = await zip.generateAsync({ type: "base64" });
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

// The data: URLs used here are complete as soon as Chrome accepts them, so
// there is nothing to wait for (and waiting would cancel a slow Save dialog).
export async function downloadFile(
  options: chrome.downloads.DownloadOptions,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  return getBrowserApi().downloads.download(options);
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
