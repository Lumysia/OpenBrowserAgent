import { isScriptableUrl } from "../shared/browser";
import { getBrowserApi } from "../shared/storage";
import { TOOL_ERROR } from "../shared/tool-errors";
import { sliceInspectablePageOutput } from "./dom-inspection-output";
import { waitForInspectablePage } from "./dom-inspection-wait";

const DEFAULT_CONTEXT_DEPTH_UP = 6;
const DEFAULT_CONTEXT_DEPTH_DOWN = 4;
const DEFAULT_SIBLING_LIMIT = 3;
const DEFAULT_ITEM_LIMIT = 30;
const DEFAULT_TEXT_LIMIT = 6_000;
const WAIT_POLL_MS = 250;

export async function inspectPage(args: Record<string, unknown>) {
  const api = getBrowserApi();
  const tabIds = Array.isArray(args.tabIds)
    ? args.tabIds
        .map(Number)
        .filter((tabId) => Number.isFinite(tabId) && tabId > 0)
    : [Number(args.tabId)].filter(
        (tabId) => Number.isFinite(tabId) && tabId > 0,
      );
  if (!tabIds.length) return { error: TOOL_ERROR.noTabIdsProvided };

  const pages = [];
  const options = buildInspectOptions(args);
  for (const tabId of tabIds) {
    try {
      const tab = await api.tabs.get(tabId);
      if (!isScriptableUrl(tab.url)) {
        pages.push({
          success: false,
          error: TOOL_ERROR.activeTabNotWebPage,
          tabId,
          title: tab.title || "",
          url: tab.url || "",
        });
        continue;
      }
      const waitResult = await waitForInspectablePage(tabId, options.waitFor);
      if (waitResult?.success === false) {
        pages.push({
          ...waitResult,
          tabId,
          title: tab.title || "",
          url: tab.url || "",
        });
        continue;
      }
      const [result] = await api.scripting.executeScript({
        target: { tabId },
        args: [options],
        func: inspectPageInDom,
      });
      const page = (result.result || {}) as Record<string, unknown>;
      pages.push({
        ...page,
        success: page.success !== false,
        tabId,
        title: tab.title || String(page.title || ""),
        url: tab.url || String(page.url || ""),
      });
    } catch (error) {
      pages.push({
        success: false,
        error: error instanceof Error ? error.message : String(error),
        tabId,
      });
    }
  }

  return sliceInspectablePageOutput(
    {
      success: pages.some((page) => page.success !== false),
      pages,
    },
    options,
  );
}

function buildInspectOptions(args: Record<string, unknown>) {
  const target = objectInput(args.target);
  const waitFor = objectInput(args.waitFor);
  return {
    include: stringArray(args.include),
    target: {
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
    },
    depthUp: positiveInteger(args.depthUp, DEFAULT_CONTEXT_DEPTH_UP),
    depthDown: positiveInteger(args.depthDown, DEFAULT_CONTEXT_DEPTH_DOWN),
    siblingLimit: positiveInteger(args.siblingLimit, DEFAULT_SIBLING_LIMIT),
    itemOffset: positiveInteger(args.itemOffset ?? args.offset, 0),
    itemLimit: positiveInteger(args.itemLimit, DEFAULT_ITEM_LIMIT),
    textOffset: positiveInteger(args.textOffset ?? args.offset, 0),
    textLimit: positiveInteger(
      args.textLimit ?? args.limit,
      DEFAULT_TEXT_LIMIT,
    ),
    waitFor: {
      text: stringArray(waitFor.text),
      selector: stringInput(waitFor.selector),
      timeout: positiveInteger(waitFor.timeout ?? args.timeout, 0),
      pollMs: positiveInteger(waitFor.pollMs, WAIT_POLL_MS),
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

function stringArray(value: unknown) {
  if (typeof value === "string") {
    const text = value.trim();
    return text ? [text] : [];
  }
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : [];
}

function positiveInteger(value: unknown, fallback: number) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return fallback;
  return Math.trunc(number);
}

function inspectPageInDom(options: {
  include: string[];
  target: {
    aiId: string;
    selector: string;
    text: string;
    ariaLabel: string;
    selected: boolean;
  };
  depthUp: number;
  depthDown: number;
  siblingLimit: number;
  itemOffset: number;
  itemLimit: number;
  textOffset: number;
  textLimit: number;
  waitFor: {
    text: string[];
    selector: string;
    timeout: number;
    pollMs: number;
  };
}) {
  const compactText = (text: string) =>
    text.replace(/\s+/g, " ").trim().slice(0, 300) || undefined;
  const rectOf = (element: Element) => {
    const rect = element.getBoundingClientRect();
    return {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  };
  const isVisible = (element: HTMLElement) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      rect.width > 0 &&
      rect.height > 0
    );
  };
  const assignAiId = (element: HTMLElement) => {
    if (!element.getAttribute("data-ai-id"))
      element.setAttribute(
        "data-ai-id",
        `ai-id-${Math.random().toString(36).slice(2, 8)}`,
      );
    return element;
  };
  const normalizeUrl = (value: string) => {
    if (!value) return "";
    try {
      return new URL(value, location.href).href;
    } catch {
      return value;
    }
  };
  const describeElement = (element: HTMLElement) => {
    const input = element as
      | HTMLInputElement
      | HTMLTextAreaElement
      | HTMLSelectElement;
    return {
      aiId: element.getAttribute("data-ai-id") || undefined,
      tag: element.tagName.toLowerCase(),
      role: element.getAttribute("role") || undefined,
      ariaLabel: element.getAttribute("aria-label") || undefined,
      title: element.getAttribute("title") || undefined,
      text: compactText(element.innerText || element.textContent || ""),
      href: element instanceof HTMLAnchorElement ? element.href : undefined,
      src:
        element instanceof HTMLImageElement
          ? element.currentSrc || element.src
          : undefined,
      alt:
        element instanceof HTMLImageElement
          ? element.alt || undefined
          : undefined,
      inputType: element instanceof HTMLInputElement ? element.type : undefined,
      placeholder:
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement
          ? element.placeholder || undefined
          : undefined,
      value: "value" in input ? input.value : undefined,
      rect: rectOf(element),
    };
  };
  const resolveTarget = () => {
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
    return null;
  };
  const isActionableElement = (element: HTMLElement) => {
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
      role === "tab" ||
      role === "menuitem" ||
      role === "option" ||
      element.hasAttribute("tabindex")
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
  const nearestReliableTarget = (element: HTMLElement) => {
    const elementRect = element.getBoundingClientRect();
    let current: HTMLElement | null = element;
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
      if (isActionableElement(current) && isVisible(current)) return current;
      const rect = current.getBoundingClientRect();
      const grewTooLarge =
        rect.width > Math.max(elementRect.width * 8, 700) ||
        rect.height > Math.max(elementRect.height * 8, 240);
      if (grewTooLarge) break;
      current = current.parentElement;
    }
    return element;
  };
  const hasAccessibleName = (element: HTMLElement) =>
    Boolean(
      element.getAttribute("aria-label") ||
      element.getAttribute("title") ||
      element.getAttribute("placeholder") ||
      element.getAttribute("alt") ||
      element.getAttribute("name"),
    );
  const distanceToTarget = (
    element: HTMLElement,
    target: HTMLElement | null,
  ) => {
    if (!target) return 0;
    if (
      target === element ||
      target.contains(element) ||
      element.contains(target)
    )
      return 0;
    const a = element.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    const ax = a.left + a.width / 2;
    const ay = a.top + a.height / 2;
    const bx = b.left + b.width / 2;
    const by = b.top + b.height / 2;
    return Math.hypot(ax - bx, ay - by);
  };
  const isNoisyContainer = (element: HTMLElement) => {
    if (isActionableElement(element) || hasAccessibleName(element))
      return false;
    const rect = element.getBoundingClientRect();
    const area = rect.width * rect.height;
    const viewportArea = window.innerWidth * window.innerHeight;
    const text = element.innerText || element.textContent || "";
    return area > viewportArea * 0.35 && text.length > 400;
  };
  const collectElements = (root: ParentNode, target: HTMLElement | null) => {
    const selectors = [
      "a",
      "button",
      "input",
      "textarea",
      "select",
      "img",
      '[contenteditable="true"]',
      "[aria-label]",
      '[role="button"]',
      '[role="link"]',
      '[role="textbox"]',
      '[role="tab"]',
      '[role="listitem"]',
      "[tabindex]",
    ].join(",");
    return (Array.from(root.querySelectorAll(selectors)) as HTMLElement[])
      .filter((element) => isVisible(element))
      .filter((element) => !isNoisyContainer(element))
      .sort((a, b) => {
        const aAction = isActionableElement(a) ? 0 : 1;
        const bAction = isActionableElement(b) ? 0 : 1;
        if (aAction !== bAction) return aAction - bAction;
        const aNamed = hasAccessibleName(a) ? 0 : 1;
        const bNamed = hasAccessibleName(b) ? 0 : 1;
        if (aNamed !== bNamed) return aNamed - bNamed;
        return distanceToTarget(a, target) - distanceToTarget(b, target);
      })
      .map((element) => describeElement(assignAiId(element)));
  };
  const imageScore = (
    rect: { width: number; height: number },
    target: HTMLElement | null,
    element: HTMLElement,
  ) => {
    const area = rect.width * rect.height;
    let score = Math.min(1, area / 50_000);
    if (target?.contains(element)) score += 0.4;
    if (rect.width <= 24 || rect.height <= 24) score -= 0.5;
    return Math.round(Math.max(0, Math.min(1, score)) * 100) / 100;
  };
  const collectImages = (root: ParentNode, target: HTMLElement | null) => {
    const seen = new Set<string>();
    const images: Array<Record<string, unknown>> = [];
    const add = (image: Record<string, unknown>) => {
      const url = String(image.url || "");
      if (!url || seen.has(url)) return;
      seen.add(url);
      images.push(image);
    };
    for (const img of Array.from(root.querySelectorAll("img,picture source"))) {
      const element = img as HTMLImageElement | HTMLSourceElement;
      const url = normalizeUrl(
        "currentSrc" in element && element.currentSrc
          ? element.currentSrc
          : element.getAttribute("src") ||
              element.getAttribute("srcset")?.split(/[\s,]+/)[0] ||
              "",
      );
      const rect = rectOf(element as HTMLElement);
      add({
        kind: "img",
        url,
        srcset: element.getAttribute("srcset") || undefined,
        alt:
          element instanceof HTMLImageElement
            ? element.alt || undefined
            : undefined,
        aiId:
          assignAiId(element as HTMLElement).getAttribute("data-ai-id") ||
          undefined,
        rect,
        score: imageScore(rect, target, element as HTMLElement),
      });
    }
    for (const element of Array.from(
      root.querySelectorAll("*"),
    ) as HTMLElement[]) {
      const backgroundImage = getComputedStyle(element).backgroundImage;
      const match = backgroundImage?.match(/url\(["']?([^"')]+)["']?\)/);
      if (!match?.[1]) continue;
      const rect = rectOf(element);
      add({
        kind: "background",
        url: normalizeUrl(match[1]),
        aiId: assignAiId(element).getAttribute("data-ai-id") || undefined,
        label:
          element.getAttribute("aria-label") ||
          element.getAttribute("title") ||
          undefined,
        rect,
        score: imageScore(rect, target, element),
      });
    }
    return images.sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  };
  const collectLinks = (root: ParentNode) =>
    Array.from(root.querySelectorAll("a[href]"))
      .filter((element) => isVisible(element as HTMLElement))
      .map((element) => describeElement(assignAiId(element as HTMLElement)))
      .filter((element) => element.href);
  const collectForms = (root: ParentNode) =>
    Array.from(
      root.querySelectorAll("input,textarea,select,[contenteditable='true']"),
    )
      .filter((element) => isVisible(element as HTMLElement))
      .map((element) => describeElement(assignAiId(element as HTMLElement)));
  const isSkippableBlock = (element: HTMLElement) => {
    const tag = element.tagName.toLowerCase();
    if (["script", "style", "noscript", "svg", "path"].includes(tag))
      return true;
    if (element.closest("nav,menu,button,input,textarea,select")) return true;
    const role = element.getAttribute("role") || "";
    return ["button", "link", "menuitem", "tab"].includes(role);
  };
  const blockKind = (element: HTMLElement) => {
    const tag = element.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) return "heading";
    if (tag === "p") return "paragraph";
    if (tag === "li") return "listItem";
    if (tag === "article" || tag === "section") return "section";
    if (element.closest("article,section,c-wiz")) return "content";
    return "text";
  };
  const collectBlocks = (root: ParentNode) => {
    const candidates = Array.from(
      root.querySelectorAll(
        "h1,h2,h3,h4,h5,h6,p,li,article,section,[role='heading'],[data-testid],div,span",
      ),
    ) as HTMLElement[];
    const seen = new Set<string>();
    const blocks: Array<Record<string, unknown>> = [];
    for (const element of candidates) {
      if (!isVisible(element) || isSkippableBlock(element)) continue;
      const text = compactText(element.innerText || element.textContent || "");
      if (!text || text.length < 20 || text.length > 500 || seen.has(text))
        continue;
      const childText = Array.from(element.children).some(
        (child) =>
          compactText(
            (child as HTMLElement).innerText || child.textContent || "",
          ) === text,
      );
      if (childText) continue;
      seen.add(text);
      const target = assignAiId(element);
      blocks.push({
        blockId: target.getAttribute("data-ai-id") || undefined,
        kind: blockKind(target),
        text,
        rect: rectOf(target),
        recommendedInsertPosition: "afterend",
        containerAiId:
          target.parentElement?.getAttribute("data-ai-id") ||
          (target.parentElement
            ? assignAiId(target.parentElement).getAttribute("data-ai-id")
            : undefined),
      });
      if (blocks.length >= 120) break;
    }
    return blocks;
  };
  const targetScore = (
    element: HTMLElement,
    needle: string,
    mode: "text" | "name",
  ) => {
    const target = nearestReliableTarget(element);
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
      "a,button,[role],article,section,div,span,p,li,h1,h2,h3,h4,h5,h6",
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
  const collectDescendants = (root: HTMLElement, depthDown: number) => {
    const items: Array<Record<string, unknown>> = [];
    const walk = (element: Element, depth: number) => {
      if (depth > depthDown || items.length >= 80) return;
      for (const child of Array.from(element.children)) {
        if (!isVisible(child as HTMLElement)) continue;
        items.push({
          depth,
          ...describeElement(assignAiId(child as HTMLElement)),
        });
        walk(child, depth + 1);
      }
    };
    walk(root, 1);
    return items;
  };
  const collectSiblings = (target: HTMLElement, siblingLimit: number) => {
    const children = Array.from(target.parentElement?.children || []);
    const index = children.indexOf(target);
    return children
      .filter((element) => element !== target)
      .filter((_, itemIndex) => Math.abs(itemIndex - index) <= siblingLimit)
      .filter((element) => isVisible(element as HTMLElement))
      .map((element) => describeElement(assignAiId(element as HTMLElement)));
  };
  const inspectContext = (target: HTMLElement) => {
    const ancestors = [];
    let current: HTMLElement | null = target;
    for (let level = 0; current && level <= options.depthUp; level += 1) {
      ancestors.push({ level, ...describeElement(assignAiId(current)) });
      current = current.parentElement;
    }
    return {
      ancestors,
      descendants: collectDescendants(target, options.depthDown),
      siblings: collectSiblings(target, options.siblingLimit),
    };
  };

  const include = new Set(
    options.include.length
      ? options.include
      : ["text", "elements", "links", "images", "forms"],
  );
  const pageText = document.body?.innerText || "";
  const targetRequested = Boolean(
    options.target.aiId ||
    options.target.selector ||
    options.target.text ||
    options.target.ariaLabel ||
    options.target.selected,
  );
  const target = resolveTarget() || null;
  const targetFound = !targetRequested || !!target;
  const warnings = targetRequested && !target ? ["TARGET_NOT_FOUND"] : [];
  const root = target || document.body;
  const elements =
    include.has("elements") || include.has("actions")
      ? collectElements(root, target)
      : [];
  const images = include.has("images") ? collectImages(root, target) : [];
  const links = include.has("links") ? collectLinks(root) : [];
  const forms = include.has("forms") ? collectForms(root) : [];
  const blocks = include.has("blocks") ? collectBlocks(root) : [];

  return {
    success: true,
    title: document.title,
    url: location.href,
    targetRequested,
    targetFound,
    warnings,
    markdown: include.has("text")
      ? `# ${document.title}\n\nURL: ${location.href}\n\n${pageText}`
      : undefined,
    target: target ? describeElement(target) : undefined,
    context: target ? inspectContext(target) : undefined,
    elements,
    images,
    links,
    forms,
    blocks,
  };
}
