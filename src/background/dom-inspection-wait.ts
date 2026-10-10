import { getBrowserApi } from "../shared/storage";
import { TOOL_ERROR } from "../shared/tool-errors";
import { abortable, delay } from "../shared/cancellation";

const DEFAULT_WAIT_TIMEOUT_MS = 5_000;

export type InspectWaitCondition = {
  text: string[];
  selector: string;
  timeout: number;
  pollMs: number;
};

export async function waitForInspectablePage(
  tabId: number,
  waitFor: InspectWaitCondition,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  if (!waitFor.text.length && !waitFor.selector) return undefined;
  const timeout = waitFor.timeout || DEFAULT_WAIT_TIMEOUT_MS;
  const started = Date.now();
  while (Date.now() - started <= timeout) {
    signal?.throwIfAborted();
    const [result] = await abortable(
      getBrowserApi().scripting.executeScript({
        target: { tabId },
        args: [waitFor],
        func: (condition) => {
          const selectorFound = condition.selector
            ? Boolean(document.querySelector(condition.selector))
            : false;
          const pageText = document.body?.innerText || "";
          const textFound = condition.text.find((text) =>
            pageText.includes(text),
          );
          return { selectorFound, textFound };
        },
      }),
      signal,
    );
    const found = (result.result || {}) as {
      selectorFound?: boolean;
      textFound?: string;
    };
    if (found.selectorFound || found.textFound)
      return { success: true, waitForFound: found };
    await delay(
      Math.min(waitFor.pollMs, Math.max(0, timeout - (Date.now() - started))),
      signal,
    );
  }
  const error = waitFor.selector
    ? waitFor.text.length
      ? TOOL_ERROR.timedOutWaitingForCondition
      : TOOL_ERROR.timedOutWaitingForSelector
    : TOOL_ERROR.timedOutWaitingForText;
  return {
    success: false,
    error,
    waitedFor: {
      selector: waitFor.selector || undefined,
      text: waitFor.text.length ? waitFor.text : undefined,
      timeout,
    },
  };
}
