export async function clickElement(tabId: number, id: string) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    args: [id],
    func: (aiId) => {
      const element = document.querySelector(`[data-ai-id="${aiId}"]`) as
        | HTMLAnchorElement
        | HTMLElement
        | null;
      if (!element) return { isNewTab: false, notFound: true };
      if (
        element.tagName === "A" &&
        (element as HTMLAnchorElement).getAttribute("href")
      ) {
        const href = (element as HTMLAnchorElement).getAttribute("href");
        return {
          isNewTab: true,
          url: href
            ? new URL(href, window.location.origin).href
            : (element as HTMLAnchorElement).href,
        };
      }
      element.click();
      return { isNewTab: false };
    },
  });
  const output = result.result as
    | { isNewTab?: boolean; notFound?: boolean; url?: string }
    | undefined;
  if (output?.isNewTab && output.url) {
    const tab = await chrome.tabs.create({ url: output.url, active: false });
    return { success: true, tabId: tab.id, shouldWaitTabLoadFinished: true };
  }
  return { success: !output?.notFound, tabId };
}

export async function cdpMouseActionElement(
  tabId: number,
  id: string,
  action: string,
) {
  const point = await getElementClickPoint(tabId, id);
  if (!point.success) return { ...point, tabId };
  const normalizedAction = cdpMouseAction(action);
  const target = { tabId };
  await chrome.debugger.attach(target, "1.3");
  try {
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: point.x,
      y: point.y,
    });
    if (normalizedAction !== "hover") {
      const count = normalizedAction === "doubleClick" ? 2 : 1;
      for (let clickCount = 1; clickCount <= count; clickCount += 1) {
        await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
          type: "mousePressed",
          x: point.x,
          y: point.y,
          button: "left",
          buttons: 1,
          clickCount,
        });
        await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
          type: "mouseReleased",
          x: point.x,
          y: point.y,
          button: "left",
          buttons: 0,
          clickCount,
        });
      }
    }
  } finally {
    await chrome.debugger.detach(target).catch(() => undefined);
  }
  return { ...point, action: normalizedAction, success: true, tabId };
}

function cdpMouseAction(action: string) {
  if (action === "hover" || action === "doubleClick") return action;
  return "click";
}

async function getElementClickPoint(tabId: number, id: string) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    args: [id],
    func: (aiId) => {
      const element = document.querySelector(
        `[data-ai-id="${CSS.escape(aiId)}"]`,
      ) as HTMLElement | null;
      if (!element) return { success: false, error: "Element not found" };
      const target =
        (element.closest(
          'button,a,[role="button"],[role="link"],[role="tab"],[role="listitem"],[role="gridcell"],[tabindex],[contenteditable="true"]',
        ) as HTMLElement | null) || element;
      target.scrollIntoView({ block: "center", inline: "center" });
      const rect = target.getBoundingClientRect();
      if (!rect.width || !rect.height)
        return { success: false, error: "Element has no clickable box" };
      return {
        success: true,
        aiId,
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        clickedTag: target.tagName.toLowerCase(),
        clickedRole: target.getAttribute("role") || undefined,
      };
    },
  });
  return (result.result || { success: false }) as
    | {
        success: true;
        aiId: string;
        x: number;
        y: number;
        clickedTag: string;
        clickedRole?: string;
      }
    | { success: false; error?: string };
}
