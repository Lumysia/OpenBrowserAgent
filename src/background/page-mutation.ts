import { isScriptableUrl } from "../shared/browser";
import { getBrowserApi } from "../shared/storage";
import { TOOL_ERROR } from "../shared/tool-errors";

export async function mutatePage(args: Record<string, unknown>) {
  const api = getBrowserApi();
  const tabId = Number(args.tabId);
  if (!Number.isFinite(tabId) || tabId <= 0)
    return { success: false, error: TOOL_ERROR.noActiveWebTabFound };
  const tab = await api.tabs.get(tabId);
  if (!isScriptableUrl(tab.url))
    return { success: false, error: TOOL_ERROR.activeTabNotWebPage };

  const operation = stringInput(args.operation || args.action);
  if (operation === "insertStyle") {
    await api.scripting.insertCSS({
      target: { tabId },
      css: stringInput(args.css || args.value),
    });
    return { success: true, tabId, operation };
  }
  if (operation === "removeStyle") {
    await api.scripting.removeCSS({
      target: { tabId },
      css: stringInput(args.css || args.value),
    });
    return { success: true, tabId, operation };
  }

  const [result] = await api.scripting.executeScript({
    target: { tabId },
    args: [buildMutationOptions(args)],
    func: mutatePageInDom,
  });
  const output = result.result || { success: false };
  if (isNewTabRequest(output)) {
    const created = await api.tabs.create({ url: output.url, active: false });
    return {
      success: true,
      tabId,
      operation,
      openedTabId: created.id,
      shouldWaitTabLoadFinished: true,
    };
  }
  return { tabId, operation, ...output };
}

function buildMutationOptions(args: Record<string, unknown>) {
  const target = objectInput(args.target);
  return {
    operation: stringInput(args.operation || args.action),
    target: {
      aiId: stringInput(target.aiId ?? target.id ?? args.aiId ?? args.id),
      selector: stringInput(target.selector ?? args.selector),
      text: stringInput(target.text ?? args.text),
      selected: target.selected === true || args.selected === true,
    },
    value: stringInput(args.value ?? args.text ?? args.html),
    attribute: stringInput(args.attribute ?? args.name),
    position: stringInput(args.position || "beforeend"),
    openLinksInNewTab: args.openLinksInNewTab !== false,
  };
}

function objectInput(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function stringInput(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isNewTabRequest(
  output: unknown,
): output is { newTab: true; url: string } {
  return (
    !!output &&
    typeof output === "object" &&
    (output as { newTab?: unknown }).newTab === true &&
    typeof (output as { url?: unknown }).url === "string"
  );
}

function mutatePageInDom(options: {
  operation: string;
  target: { aiId: string; selector: string; text: string; selected: boolean };
  value: string;
  attribute: string;
  position: string;
  openLinksInNewTab: boolean;
}) {
  const targetRequested = Boolean(
    options.target.aiId ||
    options.target.selector ||
    options.target.text ||
    options.target.selected,
  );
  const describe = (element: HTMLElement) => ({
    aiId: element.getAttribute("data-ai-id") || undefined,
    tag: element.tagName.toLowerCase(),
    role: element.getAttribute("role") || undefined,
    text: (element.innerText || element.textContent || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 180),
  });
  const dispatchInput = (element: HTMLElement) => {
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const target = (() => {
    if (options.target.aiId) {
      const element = document.querySelector(
        `[data-ai-id="${CSS.escape(options.target.aiId)}"]`,
      );
      if (element) return element as HTMLElement;
    }
    if (options.target.selector) {
      const element = document.querySelector(options.target.selector);
      if (element) return element as HTMLElement;
    }
    if (options.target.selected) {
      const element = document.querySelector('[data-oba-selected="true"]');
      if (element) return element as HTMLElement;
    }
    if (options.target.text) {
      const needle = options.target.text.toLowerCase();
      return Array.from(
        document.querySelectorAll(
          "a,button,input,textarea,[role],article,section,div,span,p,h1,h2,h3,h4,h5,h6",
        ),
      ).find((element) =>
        (element.textContent || "").toLowerCase().includes(needle),
      ) as HTMLElement | undefined;
    }
    return document.querySelector(
      '[data-oba-selected="true"]',
    ) as HTMLElement | null;
  })();

  if (!target)
    return {
      success: false,
      error: "ELEMENT_NOT_FOUND",
      targetRequested,
      targetFound: false,
    };
  const before = describe(target);

  if (options.operation === "click") {
    const link = target.closest("a[href]") as HTMLAnchorElement | null;
    if (link?.href && options.openLinksInNewTab)
      return { success: true, newTab: true, url: link.href, target: before };
    target.click();
    return { success: true, target: before };
  }

  if (options.operation === "input" || options.operation === "setValue") {
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement
    ) {
      target.value = options.value;
      dispatchInput(target);
      return { success: true, target: before, value: options.value };
    }
    if (target.isContentEditable) {
      target.textContent = options.value;
      dispatchInput(target);
      return { success: true, target: before, value: options.value };
    }
    return { success: false, error: "ELEMENT_NOT_TEXT_INPUT", target: before };
  }

  if (options.operation === "setText") target.textContent = options.value;
  else if (options.operation === "setHtml") target.innerHTML = options.value;
  else if (options.operation === "insertHtml")
    target.insertAdjacentHTML(insertPosition(options.position), options.value);
  else if (options.operation === "delete") target.remove();
  else if (options.operation === "setAttribute") {
    if (!options.attribute)
      return { success: false, error: "ATTRIBUTE_REQUIRED", target: before };
    target.setAttribute(options.attribute, options.value);
  } else if (options.operation === "removeAttribute") {
    if (!options.attribute)
      return { success: false, error: "ATTRIBUTE_REQUIRED", target: before };
    target.removeAttribute(options.attribute);
  } else if (options.operation === "setInlineStyle") {
    target.setAttribute(
      "style",
      [target.getAttribute("style") || "", options.value]
        .filter(Boolean)
        .join("; "),
    );
  } else return { success: false, error: "UNKNOWN_MUTATION", target: before };

  return { success: true, target: before };
}

function insertPosition(value: string): InsertPosition {
  if (
    value === "beforebegin" ||
    value === "afterbegin" ||
    value === "beforeend" ||
    value === "afterend"
  )
    return value;
  return "beforeend";
}
