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

  const operation = Array.isArray(args.operations)
    ? "batch"
    : stringInput(args.operation || args.action);
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
    args: [buildMutationRequest(args)],
    func: mutatePageInDom,
  });
  const output = result.result ?? {
    success: false,
    error: "Mutation script returned no result.",
    errorCode: "NO_MUTATION_RESULT",
  };
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

function buildMutationRequest(args: Record<string, unknown>) {
  const operations = Array.isArray(args.operations)
    ? args.operations
        .filter((item): item is Record<string, unknown> =>
          Boolean(item && typeof item === "object"),
        )
        .slice(0, 10)
    : [];
  return {
    operations: operations.length
      ? operations.map((operation) =>
          buildMutationOptions({ ...args, ...operation }),
        )
      : [buildMutationOptions(args)],
  };
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
    node: objectInput(args.node),
    attribute: stringInput(args.attribute ?? args.name),
    position: stringInput(args.position || "beforeend"),
    dedupeKey: stringInput(args.dedupeKey),
    skipIfExistsSelector: stringInput(args.skipIfExistsSelector),
    openLinksInNewTab: args.openLinksInNewTab !== false,
    scroll: {
      direction: stringInput(args.direction),
      x: numberInput(args.x),
      y: numberInput(args.y),
      behavior: stringInput(args.behavior || "smooth"),
    },
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

function numberInput(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
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

function mutatePageInDom(request: {
  operations: Array<{
    operation: string;
    target: { aiId: string; selector: string; text: string; selected: boolean };
    value: string;
    node: Record<string, unknown>;
    attribute: string;
    position: string;
    dedupeKey: string;
    skipIfExistsSelector: string;
    openLinksInNewTab: boolean;
    scroll: { direction: string; x?: number; y?: number; behavior: string };
  }>;
}) {
  const cssEscape = (value: string) =>
    typeof CSS !== "undefined" && CSS.escape
      ? CSS.escape(value)
      : value.replace(/["\\]/g, "\\$&");
  const insertPosition = (value: string): InsertPosition => {
    if (
      value === "beforebegin" ||
      value === "afterbegin" ||
      value === "beforeend" ||
      value === "afterend"
    )
      return value;
    return "beforeend";
  };
  const insertNode = (
    target: HTMLElement,
    node: HTMLElement,
    position: string,
  ) => {
    const resolved = insertPosition(position);
    if (resolved === "beforebegin") target.before(node);
    else if (resolved === "afterbegin") target.prepend(node);
    else if (resolved === "afterend") target.after(node);
    else target.append(node);
  };
  const createNode = (
    spec: Record<string, unknown>,
    fallbackText: string,
    dedupeKey: string,
  ): HTMLElement => {
    const tag =
      typeof spec.tag === "string" && /^[a-z][a-z0-9-]*$/i.test(spec.tag)
        ? spec.tag
        : "div";
    const element = document.createElement(tag);
    if (dedupeKey) element.setAttribute("data-oba-dedupe-key", dedupeKey);
    const attributes =
      spec.attributes && typeof spec.attributes === "object"
        ? (spec.attributes as Record<string, unknown>)
        : {};
    for (const [name, value] of Object.entries(attributes)) {
      if (/^on/i.test(name) || name === "srcdoc") continue;
      element.setAttribute(name, String(value));
    }
    const style =
      spec.style && typeof spec.style === "object"
        ? (spec.style as Record<string, unknown>)
        : {};
    for (const [name, value] of Object.entries(style))
      element.style.setProperty(name, String(value));
    const text = typeof spec.text === "string" ? spec.text : fallbackText;
    if (text) element.textContent = text;
    if (Array.isArray(spec.children)) {
      for (const child of spec.children) {
        if (child && typeof child === "object")
          element.appendChild(
            createNode(child as Record<string, unknown>, "", ""),
          );
      }
    }
    return element;
  };
  const findBestTextElement = (text: string) => {
    const needle = text.replace(/\s+/g, " ").trim().toLowerCase();
    if (!needle) return undefined;
    const compact = (value: string) => value.replace(/\s+/g, " ").trim();
    return (
      Array.from(
        document.querySelectorAll(
          "a,button,input,textarea,[role],article,section,div,span,p,li,h1,h2,h3,h4,h5,h6",
        ),
      ) as HTMLElement[]
    )
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden"
        );
      })
      .filter((element) =>
        compact(element.innerText || element.textContent || "")
          .toLowerCase()
          .includes(needle),
      )
      .sort((a, b) => {
        const aText = compact(a.innerText || a.textContent || "");
        const bText = compact(b.innerText || b.textContent || "");
        const aExact = aText.toLowerCase() === needle ? 0 : 1;
        const bExact = bText.toLowerCase() === needle ? 0 : 1;
        if (aExact !== bExact) return aExact - bExact;
        return aText.length - bText.length;
      })[0];
  };
  const runOne = (options: (typeof request.operations)[number]) => {
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
    const errorResult = (error: unknown, target?: HTMLElement) => ({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      errorName: error instanceof Error ? error.name : undefined,
      target: target ? describe(target) : undefined,
      targetFound: Boolean(target),
      targetRequested,
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
      if (options.target.text) return findBestTextElement(options.target.text);
      return document.querySelector(
        '[data-oba-selected="true"]',
      ) as HTMLElement | null;
    })();

    if (options.operation === "scroll" && !targetRequested) {
      const scrollHeight = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
      );
      const direction = options.scroll.direction || "bottom";
      const top =
        options.scroll.y ??
        (direction === "top"
          ? 0
          : direction === "pageDown"
            ? window.scrollY + window.innerHeight
            : direction === "pageUp"
              ? window.scrollY - window.innerHeight
              : scrollHeight);
      window.scrollTo({
        top,
        left: options.scroll.x ?? window.scrollX,
        behavior: options.scroll.behavior === "instant" ? "instant" : "smooth",
      });
      return { success: true, scrollY: Math.round(top), scrollHeight };
    }

    if (!target)
      return {
        success: false,
        error: "ELEMENT_NOT_FOUND",
        targetRequested,
        targetFound: false,
      };
    const before = describe(target);
    if (
      options.skipIfExistsSelector &&
      document.querySelector(options.skipIfExistsSelector)
    )
      return {
        success: true,
        skipped: true,
        reason: "SKIP_SELECTOR_FOUND",
        target: before,
      };
    if (
      options.dedupeKey &&
      target.querySelector(
        `[data-oba-dedupe-key="${cssEscape(options.dedupeKey)}"]`,
      )
    )
      return {
        success: true,
        skipped: true,
        reason: "DEDUPE_KEY_FOUND",
        target: before,
      };

    try {
      if (options.operation === "click") {
        const link = target.closest("a[href]") as HTMLAnchorElement | null;
        if (link?.href && options.openLinksInNewTab)
          return {
            success: true,
            newTab: true,
            url: link.href,
            target: before,
          };
        target.click();
        return { success: true, target: before };
      }

      if (options.operation === "scroll") {
        target.scrollIntoView({
          block: options.scroll.direction === "top" ? "start" : "center",
          inline: "nearest",
          behavior:
            options.scroll.behavior === "instant" ? "instant" : "smooth",
        });
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
        return {
          success: false,
          error: "ELEMENT_NOT_TEXT_INPUT",
          target: before,
        };
      }

      if (options.operation === "setText") target.textContent = options.value;
      else if (options.operation === "setHtml")
        target.innerHTML = options.value;
      else if (options.operation === "insertHtml")
        target.insertAdjacentHTML(
          insertPosition(options.position),
          options.value,
        );
      else if (options.operation === "insertElement")
        insertNode(
          target,
          createNode(options.node, options.value, options.dedupeKey),
          options.position,
        );
      else if (options.operation === "delete") target.remove();
      else if (options.operation === "setAttribute") {
        if (!options.attribute)
          return {
            success: false,
            error: "ATTRIBUTE_REQUIRED",
            target: before,
          };
        target.setAttribute(options.attribute, options.value);
      } else if (options.operation === "removeAttribute") {
        if (!options.attribute)
          return {
            success: false,
            error: "ATTRIBUTE_REQUIRED",
            target: before,
          };
        target.removeAttribute(options.attribute);
      } else if (options.operation === "setInlineStyle") {
        target.setAttribute(
          "style",
          [target.getAttribute("style") || "", options.value]
            .filter(Boolean)
            .join("; "),
        );
      } else
        return { success: false, error: "UNKNOWN_MUTATION", target: before };

      return { success: true, target: before };
    } catch (error) {
      return errorResult(error, target);
    }
  };

  try {
    const results = request.operations.map(runOne);
    if (results.length === 1) return results[0];
    return {
      success: results.every((result) => result.success !== false),
      results,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      errorName: error instanceof Error ? error.name : undefined,
      errorCode: "MUTATION_FAILED",
    };
  }
}
