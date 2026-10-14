import { codeHost } from "../shared/code-sandbox/host";
import type {
  CodeRunRequest,
  CodeRunResult,
} from "../shared/code-sandbox/protocol";
import {
  OFFSCREEN_MESSAGE,
  type OffscreenCancelCodeRequest,
  type OffscreenRunCodeRequest,
} from "../shared/offscreen";
import { offscreenRequest } from "./offscreen";

// Runs code in the sandbox. Background pages host it themselves; Chrome's
// service worker has no DOM and asks the offscreen document.
export async function runSandboxedCode(
  request: CodeRunRequest,
  signal?: AbortSignal,
): Promise<CodeRunResult> {
  signal?.throwIfAborted();
  const inPage = typeof document !== "undefined";
  const host = inPage
    ? await codeHost(
        !!(chrome.runtime.getManifest() as { sandbox?: unknown }).sandbox,
      )
    : undefined;
  const cancel = () => {
    if (host) return host.cancel(request.id);
    const message: OffscreenCancelCodeRequest = {
      type: OFFSCREEN_MESSAGE.cancelCode,
      id: request.id,
    };
    offscreenRequest(message, "").catch(() => undefined);
  };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    if (host) return await host.run(request);
    const message: OffscreenRunCodeRequest = {
      type: OFFSCREEN_MESSAGE.runCode,
      request,
    };
    return await offscreenRequest<CodeRunResult>(
      message,
      "The code sandbox did not answer.",
    );
  } finally {
    signal?.removeEventListener("abort", cancel);
  }
}
