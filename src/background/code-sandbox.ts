import { getBrowserApi } from "../shared/browser-api";
import { cancelSandboxRun, codeSandbox } from "../shared/code-sandbox/host";
import { hasCodeSandboxPage } from "../shared/code-sandbox/paths";
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
// service worker has no DOM and asks the offscreen document. Either way the
// manifest says whether the sandboxed page exists.
export async function runSandboxedCode(
  request: CodeRunRequest,
  signal?: AbortSignal,
): Promise<CodeRunResult> {
  signal?.throwIfAborted();
  const inPage = typeof document !== "undefined";
  const sandboxPage = hasCodeSandboxPage(getBrowserApi().runtime.getManifest());
  const cancel = () => {
    if (inPage) return cancelSandboxRun(request.id);
    const message: OffscreenCancelCodeRequest = {
      type: OFFSCREEN_MESSAGE.cancelCode,
      id: request.id,
    };
    offscreenRequest(message, "").catch(() => undefined);
  };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    if (inPage) return await codeSandbox(sandboxPage).run(request);
    const message: OffscreenRunCodeRequest = {
      type: OFFSCREEN_MESSAGE.runCode,
      request,
      sandboxPage,
    };
    return await offscreenRequest<CodeRunResult>(
      message,
      "The code sandbox did not answer.",
    );
  } finally {
    signal?.removeEventListener("abort", cancel);
  }
}
