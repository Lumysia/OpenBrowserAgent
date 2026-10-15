import { OFFSCREEN_PATH, type OffscreenRequest } from "../shared/offscreen";
import type { RuntimeReply } from "../shared/runtime-messages";

let creating: Promise<void> | undefined;

async function ensureOffscreen() {
  const url = chrome.runtime.getURL(OFFSCREEN_PATH);
  const existing = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [url],
  });
  if (existing.length) return;
  creating ??= chrome.offscreen
    .createDocument({
      url,
      reasons: [
        chrome.offscreen.Reason.DOM_PARSER,
        chrome.offscreen.Reason.BLOBS,
        chrome.offscreen.Reason.IFRAME_SCRIPTING,
        chrome.offscreen.Reason.WORKERS,
      ],
      justification:
        "Read the text of fetched web pages, hold files the agent saves to the user's downloads, and host the sandboxed page that runs the agent's code tool.",
    })
    .finally(() => {
      creating = undefined;
    });
  await creating;
}

// Runs one request in the offscreen document (Chrome's service worker only).
export async function offscreenRequest<T>(
  request: OffscreenRequest,
  failure: string,
): Promise<T> {
  await ensureOffscreen();
  const reply = (await chrome.runtime.sendMessage(request)) as
    RuntimeReply<T> | undefined;
  if (!reply?.ok) throw new Error(reply?.error || failure);
  return reply.value as T;
}
