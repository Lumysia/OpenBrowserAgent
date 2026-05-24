import { getBrowserApi } from "../shared/storage";
import { TOOL_ERROR } from "../shared/tool-errors";

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
) {
  if (!waitFor.text.length && !waitFor.selector) return undefined;
  const timeout = waitFor.timeout || DEFAULT_WAIT_TIMEOUT_MS;
  const started = Date.now();
  while (Date.now() - started <= timeout) {
    const [result] = await getBrowserApi().scripting.executeScript({
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
    });
    const found = (result.result || {}) as {
      selectorFound?: boolean;
      textFound?: string;
    };
    if (found.selectorFound || found.textFound)
      return { success: true, waitForFound: found };
    await new Promise((resolve) => setTimeout(resolve, waitFor.pollMs));
  }
  return { success: false, error: TOOL_ERROR.timedOutWaitingForText };
}
