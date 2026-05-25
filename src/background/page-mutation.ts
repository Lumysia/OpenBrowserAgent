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
  const isReliableTarget = (element: HTMLElement) => {
    const tag = element.tagName.toLowerCase();
    const role = element.getAttribute("role") || "";
    return (
      tag === "a" ||
      tag === "button" ||
      tag === "input" ||
      tag === "textarea" ||
      tag === "select" ||
      element.isContentEditable ||
      role === "button" ||
      role === "link" ||
      role === "textbox" ||
      role === "menuitem" ||
      role === "option" ||
      role === "tab"
    );
  };
  const resolveClickTarget = (element: HTMLElement) => {
    let current: HTMLElement | null = element;
    const elementRect = element.getBoundingClientRect();
    while (current && current !== document.body) {
      if (isReliableTarget(current) && isVisible(current)) return current;
      const rect = current.getBoundingClientRect();
      const grewTooLarge =
        rect.width > Math.max(elementRect.width * 8, 700) ||
        rect.height > Math.max(elementRect.height * 8, 240);
      if (grewTooLarge) break;
      current = current.parentElement;
    }
    current = element;
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
  const compact = (value: string) => value.replace(/\s+/g, " ").trim();
  const ownText = (element: HTMLElement) =>
    compact(
      Array.from(element.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent || "")
        .join(" "),
    );
  const accessibleName = (element: HTMLElement) =>
    compact(
      [
        element.getAttribute("aria-label"),
        element.getAttribute("title"),
        element.getAttribute("placeholder"),
        element.getAttribute("alt"),
        element.getAttribute("name"),
        ownText(element),
        element.innerText || element.textContent || "",
      ]
        .filter(Boolean)
        .join(" "),
    );
  const targetScore = (
    element: HTMLElement,
    needle: string,
    mode: "text" | "name",
  ) => {
    const target = resolveClickTarget(element);
    const elementText = compact(element.innerText || element.textContent || "");
    const elementOwnText = ownText(element);
    const elementName = accessibleName(element);
    const targetName = accessibleName(target);
    const targetText = compact(target.innerText || target.textContent || "");
    const haystack = mode === "name" ? elementName : elementText;
    if (!haystack.toLowerCase().includes(needle)) return null;

    let score = 0;
    if (elementOwnText.toLowerCase() === needle) score += 120;
    else if (elementName.toLowerCase() === needle) score += 105;
    else if (elementOwnText.toLowerCase().includes(needle)) score += 90;
    else if (elementName.toLowerCase().includes(needle)) score += 75;
    else if (elementText.toLowerCase().includes(needle)) score += 35;

    if (target !== element) score += 80;
    if (isReliableTarget(target)) score += 80;
    if (target instanceof HTMLAnchorElement && target.href) score += 80;
    if (targetName.toLowerCase().includes(needle)) score += 60;
    if (isReliableTarget(element)) score += 40;
    if (target === element) score += 20;

    const rect = element.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area > window.innerWidth * window.innerHeight * 0.25) score -= 160;
    if (elementText.length > 500) score -= 90;
    if (rect.width > 700 || rect.height > 280) score -= 60;
    return { score, target, textLength: targetText.length };
  };
  const findBestElement = (
    needle: string,
    selectors: string,
    mode: "text" | "name",
  ) => {
    const best = (
      Array.from(document.querySelectorAll(selectors)) as HTMLElement[]
    )
      .filter((element) => isVisible(element))
      .map((element) => {
        const match = targetScore(element, needle, mode);
        return match ? { element, ...match } : null;
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (!a || !b) return 0;
        if (a.score !== b.score) return b.score - a.score;
        return a.textLength - b.textLength;
      })[0];
    return best?.target;
  };
  const findBestTextElement = (text: string) => {
    const needle = text.replace(/\s+/g, " ").trim().toLowerCase();
    if (!needle) return undefined;
    return findBestElement(
      needle,
      "a,button,input,textarea,[role],article,section,div,span,p,li,h1,h2,h3,h4,h5,h6",
      "text",
    );
  };
  const findBestNamedElement = (name: string) => {
    const needle = name.replace(/\s+/g, " ").trim().toLowerCase();
    if (!needle) return undefined;
    return findBestElement(
      needle,
      "a,button,input,textarea,select,[contenteditable='true'],[aria-label],[title],[placeholder],[alt],[role],[tabindex]",
      "name",
    );
  };
  const runOne = (options: (typeof request.operations)[number]) => {
    const targetRequested = Boolean(
      options.target.aiId ||
      options.target.selector ||
      options.target.text ||
      options.target.ariaLabel ||
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
    const controlledEditorRejection = (
      element: HTMLElement,
      value: string,
      beforeText?: string,
      afterText?: string,
      usedNativeInsertion?: boolean,
    ) => ({
      success: false,
      error: "CONTROLLED_EDITOR_REJECTED_DOM_INPUT",
      target: describe(element),
      value,
      usedNativeInsertion,
      beforeText,
      afterText,
      requiresTrustedInput: true,
      recommendation:
        "Focus the editor, then use a trusted browser input path such as cdpInput operation=type. Do not retry DOM input or setText on this target.",
    });
    const requiresTrustedEditableInput = (element: HTMLElement) => {
      if (!element.isContentEditable) return false;
      const role = element.getAttribute("role") || "";
      const isUserInputControl = Boolean(
        role === "textbox" ||
        element.getAttribute("aria-label") ||
        element.getAttribute("aria-placeholder") ||
        element.getAttribute("placeholder") ||
        element.getAttribute("aria-multiline") ||
        element.closest("form"),
      );
      const hasEditorManagedChildren = Boolean(
        Array.from(
          element.querySelectorAll(
            "[data-slate-node],[data-slate-leaf],[data-slate-zero-width],[data-lexical-text]",
          ),
        ).length,
      );
      return isUserInputControl || hasEditorManagedChildren;
    };
    const replaceEditableText = (element: HTMLElement, value: string) => {
      element.focus({ preventScroll: true });
      const beforeText = (
        element.innerText ||
        element.textContent ||
        ""
      ).trim();
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
      const afterText = (element.innerText || element.textContent || "").trim();
      return {
        inserted,
        beforeText,
        afterText,
        accepted: afterText === value,
        controlledEditorMismatch: isControlledEditorMismatch(element, value),
      };
    };
    const isControlledEditorMismatch = (
      element: HTMLElement,
      value: string,
    ) => {
      if (!element.isContentEditable) return false;
      if (!requiresTrustedEditableInput(element)) return false;
      const zeroWidthText = Array.from(
        element.querySelectorAll("[data-slate-zero-width]"),
      )
        .map((node) => (node.textContent || "").trim())
        .join("");
      const emptyLeafText = Array.from(
        element.querySelectorAll("[class*='empty'],[data-slate-zero-width]"),
      )
        .map((node) => (node.textContent || "").trim())
        .join("");
      return zeroWidthText.includes(value) || emptyLeafText.includes(value);
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
    const locateTarget = () => {
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
    };
    let target = locateTarget();

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
        const initialRect = target.getBoundingClientRect();
        const wasOffscreen =
          initialRect.bottom < 0 ||
          initialRect.right < 0 ||
          initialRect.top > window.innerHeight ||
          initialRect.left > window.innerWidth;
        const wasPartiallyOffscreen =
          initialRect.top < 0 ||
          initialRect.left < 0 ||
          initialRect.bottom > window.innerHeight ||
          initialRect.right > window.innerWidth;
        if (!coordinateTarget && (wasOffscreen || wasPartiallyOffscreen)) {
          target.scrollIntoView({
            block: "center",
            inline: "center",
            behavior: "instant",
          });
          const refreshedTarget = locateTarget();
          if (refreshedTarget) target = refreshedTarget;
        }
        const refreshedRect = target.getBoundingClientRect();
        const clickTarget = resolveClickTarget(target);
        const clickTargetDescription = describe(clickTarget);
        const clickTargetRect = clickTarget.getBoundingClientRect();
        if (
          !isVisible(clickTarget) ||
          clickTargetRect.bottom < 0 ||
          clickTargetRect.right < 0 ||
          clickTargetRect.top > window.innerHeight ||
          clickTargetRect.left > window.innerWidth
        )
          return {
            success: false,
            error: "CLICK_TARGET_NOT_VISIBLE_AFTER_SCROLL",
            target: before,
            refreshedTarget: describe(target),
            clickTarget: clickTargetDescription,
            actionEvidence: {
              targetRequested,
              wasOffscreen,
              wasPartiallyOffscreen,
              coordinateTarget: Boolean(coordinateTarget),
            },
          };
        const link = clickTarget.closest("a[href]") as HTMLAnchorElement | null;
        if (link?.href && options.openLinksInNewTab)
          return {
            success: true,
            newTab: true,
            url: link.href,
            target: before,
            refreshedTarget: describe(target),
            clickTarget: clickTargetDescription,
            actionEvidence: {
              targetRequested,
              wasOffscreen,
              wasPartiallyOffscreen,
              coordinateTarget: Boolean(coordinateTarget),
            },
          };
        const clickedAt = dispatchHumanClick(
          clickTarget,
          coordinateTarget ? options.scroll.x : undefined,
          coordinateTarget ? options.scroll.y : undefined,
        );
        return {
          success: true,
          target: before,
          refreshedTarget: describe(target),
          clickTarget: clickTargetDescription,
          clickedAt,
          coordinateTarget: Boolean(coordinateTarget),
          actionEvidence: {
            targetRequested,
            wasOffscreen,
            wasPartiallyOffscreen,
            finalRect: {
              x: Math.round(refreshedRect.x),
              y: Math.round(refreshedRect.y),
              width: Math.round(refreshedRect.width),
              height: Math.round(refreshedRect.height),
            },
          },
          postconditionRequired: targetRequested,
          recommendation: targetRequested
            ? "Verify the page state changed as intended; a DOM click only confirms the click was dispatched."
            : undefined,
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
        return {
          success: keyResult.dispatched,
          error: keyResult.dispatched ? undefined : "KEY_EVENT_NOT_ACCEPTED",
          target: before,
          ...keyResult,
        };
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
          if (requiresTrustedEditableInput(target))
            return controlledEditorRejection(target, options.value);
          const editableResult = replaceEditableText(target, options.value);
          if (editableResult.controlledEditorMismatch)
            return controlledEditorRejection(
              target,
              options.value,
              editableResult.beforeText,
              editableResult.afterText,
              editableResult.inserted,
            );
          return {
            success: editableResult.accepted,
            error: editableResult.accepted
              ? undefined
              : "TEXT_INPUT_NOT_ACCEPTED",
            target: before,
            value: options.value,
            usedNativeInsertion: editableResult.inserted,
            beforeText: editableResult.beforeText,
            afterText: editableResult.afterText,
          };
        }
        return {
          success: false,
          error: "ELEMENT_NOT_TEXT_INPUT",
          target: before,
        };
      }

      if (options.operation === "setText") {
        if (target.isContentEditable) {
          if (requiresTrustedEditableInput(target))
            return controlledEditorRejection(target, options.value);
          const editableResult = replaceEditableText(target, options.value);
          return {
            success: editableResult.accepted,
            error: editableResult.accepted
              ? undefined
              : "TEXT_INPUT_NOT_ACCEPTED",
            target: before,
            value: options.value,
            usedNativeInsertion: editableResult.inserted,
            beforeText: editableResult.beforeText,
            afterText: editableResult.afterText,
          };
        }
        target.textContent = options.value;
      } else if (options.operation === "setHtml")
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
