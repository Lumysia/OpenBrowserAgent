import type { MutationRequest } from "./page-mutation";
import type { PageDom } from "./page-dom";

// Runs in the page's isolated world after installPageDom. executeScript
// serializes only this function's source: keep it self-contained.
export function mutatePageInDom(request: MutationRequest) {
  const dom = (globalThis as unknown as { obaPageDom: PageDom }).obaPageDom;
  const { isVisible, findTarget } = dom;
  const isOffscreen = (rect: DOMRect) =>
    rect.bottom < 0 ||
    rect.right < 0 ||
    rect.top > window.innerHeight ||
    rect.left > window.innerWidth;
  const insertNode = (target: HTMLElement, node: Node, position: string) => {
    if (position === "beforebegin") target.before(node);
    else if (position === "afterbegin") target.prepend(node);
    else if (position === "afterend") target.after(node);
    else target.append(node);
  };
  // Page JavaScript is a separate, default-off capability; DOM edits must not
  // smuggle script in through markup or attributes.
  const unsafeAttribute = (name: string, value: string) =>
    /^on/i.test(name) ||
    name.toLowerCase() === "srcdoc" ||
    /^(javascript|vbscript):/i.test(value.replace(/[\s\u0000-\u001f]/g, ""));
  const sanitize = (root: DocumentFragment) => {
    for (const element of Array.from(root.querySelectorAll("*"))) {
      if (element.tagName.toLowerCase() === "script") element.remove();
      if (element instanceof HTMLTemplateElement) sanitize(element.content);
      for (const { name, value } of Array.from(element.attributes))
        if (unsafeAttribute(name, value)) element.removeAttribute(name);
    }
    return root;
  };
  const parseHtml = (html: string) => {
    const template = document.createElement("template");
    template.innerHTML = html;
    // Clone after stripping: in the isolated world, removing an on* attribute
    // does not drop the handler the parser already attached (seen in Chromium).
    // A clone copies only the remaining attributes.
    return document.importNode(sanitize(template.content), true);
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
      if (unsafeAttribute(name, String(value))) continue;
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
    target.dispatchEvent(new PointerEvent("pointerover", pointerInit));
    target.dispatchEvent(new PointerEvent("pointerenter", pointerInit));
    target.dispatchEvent(new PointerEvent("pointerdown", pointerInit));
    target.dispatchEvent(new MouseEvent("mouseover", eventInit));
    target.dispatchEvent(new MouseEvent("mouseenter", eventInit));
    target.dispatchEvent(new MouseEvent("mousedown", eventInit));
    target.dispatchEvent(
      new MouseEvent("mouseup", { ...eventInit, buttons: 0 }),
    );
    target.dispatchEvent(
      new PointerEvent("pointerup", { ...pointerInit, buttons: 0 }),
    );
    target.dispatchEvent(new MouseEvent("click", { ...eventInit, buttons: 0 }));
    return { x: Math.round(clientX), y: Math.round(clientY) };
  };
  const runOne = (options: (typeof request.operations)[number]) => {
    const targetRequested = dom.targetRequested(options.target);
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
      const init = {
        bubbles: true,
        composed: true,
        data,
        inputType: "insertText",
      };
      element.dispatchEvent(
        new InputEvent("beforeinput", { ...init, cancelable: true }),
      );
      element.dispatchEvent(new InputEvent("input", init));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    };
    const controlledEditorRejection = (
      element: HTMLElement,
      value: string,
    ) => ({
      success: false,
      error: "CONTROLLED_EDITOR_REJECTED_DOM_INPUT",
      target: describe(element),
      value,
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
    // Rich editors (Slate, Lexical) keep their own model and undo DOM edits;
    // report that instead of claiming success.
    const editText = (element: HTMLElement, value: string) => {
      if (requiresTrustedEditableInput(element))
        return controlledEditorRejection(element, value);
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
        range.selectNodeContents(element);
        range.collapse(false);
        selection?.removeAllRanges();
        selection?.addRange(range);
        dispatchInput(element, value);
      }
      const afterText = (element.innerText || element.textContent || "").trim();
      const accepted = afterText === value;
      return {
        success: accepted,
        error: accepted ? undefined : "TEXT_INPUT_NOT_ACCEPTED",
        target: describe(element),
        value,
        usedNativeInsertion: inserted,
        beforeText,
        afterText,
      };
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
      const found = findTarget(options.target);
      if (found || targetRequested) return found;
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
        `[data-oba-dedupe-key="${CSS.escape(options.dedupeKey)}"]`,
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
        const wasOffscreen = isOffscreen(initialRect);
        const wasPartiallyOffscreen =
          initialRect.top < 0 ||
          initialRect.left < 0 ||
          initialRect.bottom > window.innerHeight ||
          initialRect.right > window.innerWidth;
        if (!coordinateTarget && wasPartiallyOffscreen) {
          target.scrollIntoView({
            block: "center",
            inline: "center",
            behavior: "instant",
          });
          const refreshedTarget = locateTarget();
          if (refreshedTarget) target = refreshedTarget;
        }
        const clickTarget = dom.clickTarget(target);
        const clicked = {
          target: before,
          refreshedTarget: describe(target),
          clickTarget: describe(clickTarget),
          coordinateTarget: Boolean(coordinateTarget),
          actionEvidence: {
            targetRequested,
            wasOffscreen,
            wasPartiallyOffscreen,
          },
        };
        if (
          !isVisible(clickTarget) ||
          isOffscreen(clickTarget.getBoundingClientRect())
        )
          return {
            success: false,
            error: "CLICK_TARGET_NOT_VISIBLE_AFTER_SCROLL",
            ...clicked,
          };
        const link = clickTarget.closest("a[href]") as HTMLAnchorElement | null;
        const pageUrl = (url: string) => url.split("#")[0];
        if (
          options.openLinksInNewTab &&
          link &&
          /^https?:/.test(link.href) &&
          pageUrl(link.href) !== pageUrl(location.href)
        )
          return { success: true, newTab: true, url: link.href, ...clicked };
        const clickedAt = dispatchHumanClick(
          clickTarget,
          coordinateTarget ? options.scroll.x : undefined,
          coordinateTarget ? options.scroll.y : undefined,
        );
        return {
          success: true,
          ...clicked,
          clickedAt,
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
          // The prototype setter keeps React's value tracker in sync, so the
          // following input event is not swallowed as a no-op.
          Object.getOwnPropertyDescriptor(
            Object.getPrototypeOf(target),
            "value",
          )!.set!.call(target, options.value);
          dispatchInput(target, options.value);
          return { success: true, target: before, value: options.value };
        }
        if (target.isContentEditable) return editText(target, options.value);
        return {
          success: false,
          error: "ELEMENT_NOT_TEXT_INPUT",
          target: before,
        };
      }

      if (options.operation === "setText") {
        if (target.isContentEditable) return editText(target, options.value);
        target.textContent = options.value;
      } else if (options.operation === "setHtml")
        target.replaceChildren(parseHtml(options.value));
      else if (options.operation === "insertHtml")
        insertNode(target, parseHtml(options.value), options.position);
      else if (options.operation === "insertElement")
        insertNode(
          target,
          createNode(options.node, options.value, options.dedupeKey),
          options.position,
        );
      else if (options.operation === "delete") target.remove();
      else if (
        options.operation === "setAttribute" ||
        options.operation === "removeAttribute"
      ) {
        const { attribute, value } = options;
        const error = !attribute
          ? "ATTRIBUTE_REQUIRED"
          : options.operation === "setAttribute" &&
              unsafeAttribute(attribute, value)
            ? "UNSAFE_ATTRIBUTE"
            : "";
        if (error) return { success: false, error, target: before };
        if (options.operation === "setAttribute")
          target.setAttribute(attribute, value);
        else target.removeAttribute(attribute);
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
