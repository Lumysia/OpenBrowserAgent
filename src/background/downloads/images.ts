import JSZip from "jszip";
import {
  IMAGE_ALT_MAX_LENGTH,
  IMAGE_FILENAME_MAX_LABEL_LENGTH,
  MAX_IMAGES_PER_DOWNLOAD,
  MAX_SCANNED_ELEMENTS_FOR_IMAGES,
} from "../../shared/config";
import { getBrowserApi } from "../../shared/browser-api";
import { extensionForType, extensionOf } from "../../shared/mime";
import { safeSegment } from "./filenames";

// The tab's images (img elements and CSS backgrounds) in one zip file.
export async function tabImagesZip(tabId: number, signal?: AbortSignal) {
  const api = getBrowserApi();
  const tab = await api.tabs.get(tabId);
  const [result] = await api.scripting.executeScript({
    target: { tabId },
    args: [IMAGE_ALT_MAX_LENGTH, MAX_SCANNED_ELEMENTS_FOR_IMAGES],
    // Runs in the page: self-contained.
    func: (altMaxLength: number, maxElements: number) => {
      const seen = new Set<string>();
      const images: Array<{
        src: string;
        alt: string;
        index: number;
        type: string;
      }> = [];
      let index = 0;
      // A web URL, resolved against the page; data: and blob: URLs and
      // other schemes are left out.
      const webUrl = (value: string) => {
        try {
          const url = new URL(value, location.href);
          return /^https?:$/.test(url.protocol) ? url.href : "";
        } catch {
          return "";
        }
      };
      const add = (value: string, alt: string, type: string) => {
        const src = webUrl(value);
        if (!src || seen.has(src)) return;
        seen.add(src);
        images.push({
          src,
          alt: alt.slice(0, altMaxLength),
          index: index++,
          type,
        });
      };
      // currentSrc is the source the browser chose from srcset or <picture>.
      for (const img of Array.from(document.images))
        if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0)
          add(img.currentSrc || img.src, img.alt || `img-${index}`, "img");
      // Any element can carry CSS background images, several per element.
      const walker = document.createTreeWalker(
        document.body || document.documentElement,
        NodeFilter.SHOW_ELEMENT,
      );
      for (
        let element = walker.currentNode as Element | null, scanned = 0;
        element && scanned < maxElements;
        element = walker.nextNode() as Element | null, scanned++
      ) {
        const background = getComputedStyle(element).backgroundImage;
        if (!background || background === "none") continue;
        const label =
          element.getAttribute("aria-label") ||
          element.getAttribute("title") ||
          element.tagName.toLowerCase();
        for (const match of background.matchAll(/url\(["']?(.*?)["']?\)/g))
          add(match[1], `bg-${label}-${index}`, "background");
      }
      return images;
    },
  });
  const images = result.result || [];
  const name = `${safeSegment(tab.title || tab.url || "tab")}_images.zip`;
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
        `${String(image.index + 1).padStart(3, "0")}_${safeSegment(image.alt || image.type || "image").slice(0, IMAGE_FILENAME_MAX_LABEL_LENGTH)}.${extension}`,
        bytes,
      );
      downloadedCount += 1;
    } catch {
      signal?.throwIfAborted();
      // Some sites block image fetches; keep going and zip the images we can access.
    }
  }
  return {
    totalFound: images.length,
    downloadedCount,
    file: downloadedCount
      ? { blob: await zip.generateAsync({ type: "blob" }), name }
      : undefined,
  };
}

function imageExtension(contentType: string | null, url: string) {
  return (
    extensionForType(contentType || "") ||
    extensionOf(new URL(url).pathname) ||
    "jpg"
  );
}
