import type { Messages } from "../../src/shared/i18n";
import { escapeHtml } from "./markdown-engine";

// Images the extension made itself: attachments, screenshots, generated images.
const LOCAL_IMAGE_URL = /^(data:image\/|blob:)/i;
const REMOTE_IMAGE_URL = /^https?:\/\/[^/?#\s]+/i;

// Images in model output can point anywhere, and loading one sends its URL,
// which a prompt-injected page can fill with private data. Only images the
// extension made itself (data: and blob: URLs) load without a click.
export function renderMarkdownImage(
  href: string,
  title: string | null,
  text: string,
  t: Messages,
  loadedImages: readonly string[],
) {
  const url = href.trim();
  const alt = escapeHtml(text || title || "");
  const remote = REMOTE_IMAGE_URL.exec(url);
  if (LOCAL_IMAGE_URL.test(url) || (remote && loadedImages.includes(url)))
    return `<figure class="markdown-image-card"><img src="${escapeHtml(url)}" alt="${alt}" title="${escapeHtml(title || "")}" loading="lazy" referrerpolicy="no-referrer" /><figcaption>${alt}</figcaption></figure>`;
  if (!remote) return `<span class="markdown-image-invalid">${alt}</span>`;
  const host = escapeHtml(remote[0].replace(/^https?:\/\//i, ""));
  return `<span class="markdown-image-blocked" title="${escapeHtml(t.sidepanel.remoteImageNotLoaded)}"><span class="markdown-image-blocked-text"><span class="markdown-image-blocked-alt">${alt || host}</span><span class="markdown-image-blocked-host">${host}</span></span><span class="markdown-image-blocked-actions"><button type="button" class="ui-button ui-button-secondary ui-button-sm" data-image-src="${escapeHtml(url)}">${escapeHtml(t.sidepanel.loadImage)}</button><a class="ui-button ui-button-ghost ui-button-sm" href="${escapeHtml(url)}">${escapeHtml(t.sidepanel.openImage)}</a></span></span>`;
}
