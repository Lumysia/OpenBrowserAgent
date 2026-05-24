import { isScriptableUrl } from "../shared/browser";
import { getBrowserApi } from "../shared/storage";
import { TOOL_ERROR } from "../shared/tool-errors";
import {
  buildMutationRequest,
  isNewTabRequest,
  type MutationRequest,
  stringInput,
} from "./page-mutation-options";

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

function mutatePageInDom(request: MutationRequest) {
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
  const isVisible = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== "none" &&
      style.visibility !== "hidden"
    );
  };
  const isActionable = (element: HTMLElement) => {
    const tag = element.tagName.toLowerCase();
    const role = element.getAttribute("role") || "";
    const tabindex = element.getAttribute("tabindex");
    return (
      tag === "a" ||
      tag === "button" ||
      tag === "input" ||
      tag === "textarea" ||
      tag === "select" ||
      element.isContentEditable ||
      role === "button" ||
      role === "link" ||
      role === "menuitem" ||
      role === "option" ||
      role === "row" ||
      role === "gridcell" ||
      role === "tab" ||
      tabindex !== null
    );
  };
  const resolveClickTarget = (element: HTMLElement) => {
    let current: HTMLElement | null = element;
    const elementRect = element.getBoundingClientRect();
    while (current && current !== document.body) {
      if (isActionable(current) && isVisible(current)) return current;
      const rect = current.getBoundingClientRect();
      const grewTooLarge =
        rect.width > Math.max(elementRect.width * 8, 700) ||
        rect.height > Math.max(elementRect.height * 8, 240);
      if (grewTooLarge) break;
      current = current.parentElement;
    }
    return element;
  };
  const dispatchHumanClick = (target: HTMLElement, x?: number, y?: number) => {
    const rect = target.getBoundingClientRect();
    const clientX = x ?? rect.left + rect.width / 2;
    const clientY = y ?? rect.top + rect.height / 2;
    target.scrollIntoView({ block: "center", inline: "center" });
    target.focus({ preventScroll: true });
    const eventInit = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX,
      clientY,
      button: 0,
      buttons: 1,
    };
    const pointerInit = {
      ...eventInit,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    };
    if (typeof PointerEvent !== "undefined") {
      target.dispatchEvent(new PointerEvent("pointerover", pointerInit));
      target.dispatchEvent(new PointerEvent("pointerenter", pointerInit));
      target.dispatchEvent(new PointerEvent("pointerdown", pointerInit));
    }
    target.dispatchEvent(new MouseEvent("mouseover", eventInit));
    target.dispatchEvent(new MouseEvent("mouseenter", eventInit));
    target.dispatchEvent(new MouseEvent("mousedown", eventInit));
    target.dispatchEvent(
      new MouseEvent("mouseup", { ...eventInit, buttons: 0 }),
    );
    if (typeof PointerEvent !== "undefined")
      target.dispatchEvent(
        new PointerEvent("pointerup", { ...pointerInit, buttons: 0 }),
      );
    target.dispatchEvent(new MouseEvent("click", { ...eventInit, buttons: 0 }));
    return { x: Math.round(clientX), y: Math.round(clientY) };
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
        return isVisible(element);
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
  const findBestNamedElement = (name: string) => {
    const needle = name.replace(/\s+/g, " ").trim().toLowerCase();
    if (!needle) return undefined;
    const accessibleName = (element: HTMLElement) =>
      [
        element.getAttribute("aria-label"),
        element.getAttribute("title"),
        element.getAttribute("placeholder"),
        element.getAttribute("alt"),
        element.getAttribute("name"),
        element.innerText || element.textContent || "",
      ]
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
    return (
      Array.from(
        document.querySelectorAll(
          "a,button,input,textarea,select,[contenteditable='true'],[aria-label],[title],[placeholder],[alt],[role],[tabindex]",
        ),
      ) as HTMLElement[]
    )
      .filter((element) => isVisible(element))
      .filter((element) =>
        accessibleName(element).toLowerCase().includes(needle),
      )
      .sort((a, b) => {
        const aName = accessibleName(a).toLowerCase();
        const bName = accessibleName(b).toLowerCase();
        const aExact = aName === needle ? 0 : 1;
        const bExact = bName === needle ? 0 : 1;
        if (aExact !== bExact) return aExact - bExact;
        return aName.length - bName.length;
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
    const dispatchInput = (
      element: HTMLElement,
      data: string | null = null,
    ) => {
      if (typeof InputEvent !== "undefined") {
        element.dispatchEvent(
          new InputEvent("beforeinput", {
            bubbles: true,
            cancelable: true,
            composed: true,
            data,
            inputType: "insertText",
          }),
        );
        element.dispatchEvent(
          new InputEvent("input", {
            bubbles: true,
            cancelable: false,
            composed: true,
            data,
            inputType: "insertText",
          }),
        );
      } else element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    };
    const replaceEditableText = (element: HTMLElement, value: string) => {
      element.focus({ preventScroll: true });
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(element);
      selection?.removeAllRanges();
      selection?.addRange(range);
      const inserted = document.execCommand("insertText", false, value);
      if (!inserted) {
        element.textContent = value;
        const fallbackRange = document.createRange();
        fallbackRange.selectNodeContents(element);
        fallbackRange.collapse(false);
        selection?.removeAllRanges();
        selection?.addRange(fallbackRange);
        dispatchInput(element, value);
      }
      return inserted;
    };
    const dispatchKey = (
      element: HTMLElement,
      keyOptions: typeof options.key,
    ) => {
      element.focus({ preventScroll: true });
      const key = keyOptions.key || "Enter";
      const code = keyOptions.code;
      const init = {
        key,
        code,
        bubbles: true,
        cancelable: true,
        composed: true,
        ctrlKey: keyOptions.ctrlKey,
        shiftKey: keyOptions.shiftKey,
        altKey: keyOptions.altKey,
        metaKey: keyOptions.metaKey,
      };
      const down = new KeyboardEvent("keydown", init);
      const downResult = element.dispatchEvent(down);
      const pressResult =
        key.length === 1 || key === "Enter"
          ? element.dispatchEvent(new KeyboardEvent("keypress", init))
          : true;
      const upResult = element.dispatchEvent(
        new KeyboardEvent("keyup", { ...init, cancelable: false }),
      );
      return {
        key,
        code,
        defaultPrevented: down.defaultPrevented,
        dispatched: downResult && pressResult && upResult,
      };
    };
    const coordinateTarget =
      options.operation === "click" &&
      Number.isFinite(options.scroll.x) &&
      Number.isFinite(options.scroll.y)
        ? (document.elementFromPoint(
            options.scroll.x as number,
            options.scroll.y as number,
          ) as HTMLElement | null)
        : null;
    const target = (() => {
      if (coordinateTarget) return coordinateTarget;
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
      if (options.target.ariaLabel)
        return findBestNamedElement(options.target.ariaLabel);
      if (options.target.text) return findBestTextElement(options.target.text);
      if (options.operation === "key")
        return document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
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
        const clickTarget = resolveClickTarget(target);
        const clickTargetDescription = describe(clickTarget);
        const link = clickTarget.closest("a[href]") as HTMLAnchorElement | null;
        if (link?.href && options.openLinksInNewTab)
          return {
            success: true,
            newTab: true,
            url: link.href,
            target: before,
            clickTarget: clickTargetDescription,
          };
        const clickedAt = dispatchHumanClick(
          clickTarget,
          coordinateTarget ? options.scroll.x : undefined,
          coordinateTarget ? options.scroll.y : undefined,
        );
        return {
          success: true,
          target: before,
          clickTarget: clickTargetDescription,
          clickedAt,
          coordinateTarget: Boolean(coordinateTarget),
        };
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

      if (options.operation === "key") {
        const keyResult = dispatchKey(target, options.key);
        return { success: true, target: before, ...keyResult };
      }

      if (options.operation === "input" || options.operation === "setValue") {
        if (
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLSelectElement
        ) {
          target.value = options.value;
          dispatchInput(target, options.value);
          return { success: true, target: before, value: options.value };
        }
        if (target.isContentEditable) {
          const usedNativeInsertion = replaceEditableText(
            target,
            options.value,
          );
          return {
            success: true,
            target: before,
            value: options.value,
            usedNativeInsertion,
          };
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
