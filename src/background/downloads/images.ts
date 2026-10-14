import JSZip from "jszip";
import {
  IMAGE_ALT_MAX_LENGTH,
  IMAGE_FILENAME_MAX_LABEL_LENGTH,
  MAX_IMAGES_PER_DOWNLOAD,
} from "../../shared/config";
import { getBrowserApi } from "../../shared/storage";
import { safeSegment } from "./filenames";

// The tab's images (img elements and CSS backgrounds) in one zip file.
export async function tabImagesZip(tabId: number, signal?: AbortSignal) {
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
  const fromType = contentType
    ?.split("/")[1]
    ?.split(";")[0]
    ?.replace("jpeg", "jpg")
    .replace("svg+xml", "svg");
  if (fromType && /^[a-z0-9]+$/i.test(fromType)) return fromType;
  const match = new URL(url).pathname.match(/\.([a-z0-9]{2,5})$/i);
  return match?.[1] || "jpg";
}
