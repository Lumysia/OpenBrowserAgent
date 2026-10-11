import { getBrowserApi } from "../shared/storage";

export type PageTarget = {
  aiId: string;
  selector: string;
  text: string;
  ariaLabel: string;
  selected: boolean;
};

// Element lookup shared by inspectPage and mutatePage. It is installed in the
// extension's isolated world and read back as globalThis.obaPageDom.
export type PageDom = {
  compact(value: string): string;
  isVisible(element: HTMLElement): boolean;
  isActionable(element: HTMLElement): boolean;
  isReliableTarget(element: HTMLElement): boolean;
  clickTarget(element: HTMLElement): HTMLElement;
  accessibleName(element: HTMLElement): string;
  targetRequested(target: PageTarget): boolean;
  // Explicit targets (aiId, selector, selected) first, then the best text or
  // accessible-name match. Null when nothing was asked for or matched.
  findTarget(target: PageTarget): HTMLElement | null;
};

export function objectInput(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

export function stringInput(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

// The tool arguments that name a page element, shared by inspect and mutate.
export function readPageTarget(args: Record<string, unknown>): PageTarget {
  const target = objectInput(args.target);
  return {
    aiId: stringInput(target.aiId ?? target.id ?? args.aiId ?? args.id),
    selector: stringInput(target.selector ?? args.selector),
    text: stringInput(target.text ?? args.text),
    ariaLabel: stringInput(
      target.ariaLabel ??
        target.label ??
        target.accessibleName ??
        target.title ??
        target.placeholder ??
        args.ariaLabel ??
        args.label,
    ),
    selected: target.selected === true || args.selected === true,
  };
}

export async function injectPageDom(tabId: number) {
  await getBrowserApi().scripting.executeScript({
    target: { tabId },
    func: installPageDom,
  });
}

// executeScript serializes only this function's source: keep it self-contained.
function installPageDom() {
  const compact = (value: string) => value.replace(/\s+/g, " ").trim();
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
  const reliableTags = new Set(["a", "button", "input", "textarea", "select"]);
  const reliableRoles = new Set([
    "button",
    "link",
    "textbox",
    "menuitem",
    "option",
    "tab",
  ]);
  const isReliableTarget = (element: HTMLElement) =>
    reliableTags.has(element.tagName.toLowerCase()) ||
    element.isContentEditable ||
    reliableRoles.has(element.getAttribute("role") || "");
  const isActionable = (element: HTMLElement) =>
    isReliableTarget(element) ||
    ["row", "gridcell"].includes(element.getAttribute("role") || "") ||
    element.hasAttribute("tabindex");
  // Walk up to the nearest control, but stop before a large container.
  const closestWithin = (
    element: HTMLElement,
    accept: (element: HTMLElement) => boolean,
  ) => {
    const start = element.getBoundingClientRect();
    for (
      let current: HTMLElement | null = element;
      current && current !== document.body;
      current = current.parentElement
    ) {
      if (accept(current) && isVisible(current)) return current;
      const rect = current.getBoundingClientRect();
      if (
        rect.width > Math.max(start.width * 8, 700) ||
        rect.height > Math.max(start.height * 8, 240)
      )
        return null;
    }
    return null;
  };
  const clickTarget = (element: HTMLElement) =>
    closestWithin(element, isReliableTarget) ||
    closestWithin(element, isActionable) ||
    element;
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
    const target = clickTarget(element);
    const elementText = compact(element.innerText || element.textContent || "");
    const elementOwnText = ownText(element).toLowerCase();
    const elementName = accessibleName(element).toLowerCase();
    const haystack = mode === "name" ? elementName : elementText.toLowerCase();
    if (!haystack.includes(needle)) return null;

    let score = 0;
    if (elementOwnText === needle) score += 120;
    else if (elementName === needle) score += 105;
    else if (elementOwnText.includes(needle)) score += 90;
    else if (elementName.includes(needle)) score += 75;
    else score += 35;

    if (target !== element) score += 80;
    if (isReliableTarget(target)) score += 80;
    if (target instanceof HTMLAnchorElement && target.href) score += 80;
    if (accessibleName(target).toLowerCase().includes(needle)) score += 60;
    if (isReliableTarget(element)) score += 40;
    if (target === element) score += 20;

    const rect = element.getBoundingClientRect();
    if (rect.width * rect.height > (window.innerWidth * window.innerHeight) / 4)
      score -= 160;
    if (elementText.length > 500) score -= 90;
    if (rect.width > 700 || rect.height > 280) score -= 60;
    const textLength = compact(
      target.innerText || target.textContent || "",
    ).length;
    return { score, target, textLength };
  };
  const findBest = (text: string, selectors: string, mode: "text" | "name") => {
    const needle = compact(text).toLowerCase();
    if (!needle) return null;
    let best: ReturnType<typeof targetScore> = null;
    for (const element of document.querySelectorAll<HTMLElement>(selectors)) {
      if (!isVisible(element)) continue;
      const match = targetScore(element, needle, mode);
      if (
        match &&
        (!best ||
          match.score > best.score ||
          (match.score === best.score && match.textLength < best.textLength))
      )
        best = match;
    }
    return best?.target || null;
  };
  const query = (selector: string) =>
    selector ? document.querySelector<HTMLElement>(selector) : null;
  const dom: PageDom = {
    compact,
    isVisible,
    isActionable,
    isReliableTarget,
    clickTarget,
    accessibleName,
    targetRequested: (target) =>
      Boolean(
        target.aiId ||
        target.selector ||
        target.text ||
        target.ariaLabel ||
        target.selected,
      ),
    findTarget: (target) => {
      const explicit =
        (target.aiId && query(`[data-ai-id="${CSS.escape(target.aiId)}"]`)) ||
        query(target.selector) ||
        (target.selected && query('[data-oba-selected="true"]'));
      if (explicit) return explicit;
      if (target.ariaLabel)
        return findBest(
          target.ariaLabel,
          "a,button,input,textarea,select,[contenteditable='true'],[aria-label],[title],[placeholder],[alt],[role],[tabindex]",
          "name",
        );
      if (target.text)
        return findBest(
          target.text,
          "a,button,input,textarea,[role],article,section,div,span,p,li,h1,h2,h3,h4,h5,h6",
          "text",
        );
      return null;
    },
  };
  Object.assign(globalThis, { obaPageDom: dom });
}
