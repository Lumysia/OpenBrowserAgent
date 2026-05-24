import { isScriptableUrl } from "../shared/browser";
import { getBrowserApi } from "../shared/storage";
import { TOOL_ERROR } from "../shared/tool-errors";
import { withContentSlice, withListSlice } from "./tool-utils";

const DEFAULT_CONTEXT_DEPTH_UP = 6;
const DEFAULT_CONTEXT_DEPTH_DOWN = 4;
const DEFAULT_SIBLING_LIMIT = 3;
const DEFAULT_ITEM_LIMIT = 30;
const DEFAULT_TEXT_LIMIT = 6_000;

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
  return {
    include: stringArray(args.include),
    target: {
      aiId: stringInput(target.aiId ?? target.id ?? args.aiId ?? args.id),
      selector: stringInput(target.selector ?? args.selector),
      text: stringInput(target.text ?? args.text),
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
  return Array.isArray(value)
    ? value.map((item) => String(item)).filter(Boolean)
    : [];
}

function positiveInteger(value: unknown, fallback: number) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return fallback;
  return Math.trunc(number);
}

export function sliceInspectablePageOutput(
  output: unknown,
  args: Record<string, unknown>,
) {
  if (
    !output ||
    typeof output !== "object" ||
    !Array.isArray((output as { pages?: unknown[] }).pages)
  )
    return output;
  return {
    pages: (output as { pages: Array<Record<string, unknown>> }).pages.map(
      (page) => ({
        ...withContentSlice(
          page,
          String(page.markdown || ""),
          { offset: args.textOffset, limit: args.textLimit },
          "markdown",
        ),
        ...sliceLists(page, args),
      }),
    ),
  };
}

function sliceLists(
  page: Record<string, unknown>,
  args: Record<string, unknown>,
) {
  const itemArgs = {
    offset: args.itemOffset ?? args.offset,
    limit: args.itemLimit,
  };
  return {
    ...(Array.isArray(page.elements)
      ? withListSlice({}, page.elements, itemArgs, "elements")
      : {}),
    ...(Array.isArray(page.images)
      ? withListSlice({}, page.images, itemArgs, "images")
      : {}),
    ...(Array.isArray(page.links)
      ? withListSlice({}, page.links, itemArgs, "links")
      : {}),
    ...(Array.isArray(page.forms)
      ? withListSlice({}, page.forms, itemArgs, "forms")
      : {}),
  };
}

function inspectPageInDom(options: {
  include: string[];
  target: { aiId: string; selector: string; text: string; selected: boolean };
  depthUp: number;
  depthDown: number;
  siblingLimit: number;
  itemOffset: number;
  itemLimit: number;
  textOffset: number;
  textLimit: number;
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
    if (options.target.text) {
      const needle = options.target.text.toLowerCase();
      return Array.from(
        document.querySelectorAll(
          "a,button,[role],article,section,div,span,p,h1,h2,h3,h4,h5,h6",
        ),
      ).find((element) =>
        (element.textContent || "").toLowerCase().includes(needle),
      ) as HTMLElement | undefined;
    }
    return document.querySelector(
      '[data-oba-selected="true"]',
    ) as HTMLElement | null;
  };
  const collectElements = (root: ParentNode) => {
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
    return Array.from(root.querySelectorAll(selectors))
      .filter((element) => isVisible(element as HTMLElement))
      .map((element) => describeElement(assignAiId(element as HTMLElement)));
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
    options.target.selected,
  );
  const target = resolveTarget() || null;
  const targetFound = !targetRequested || !!target;
  const warnings = targetRequested && !target ? ["TARGET_NOT_FOUND"] : [];
  const root = target || document.body;
  const elements =
    include.has("elements") || include.has("actions")
      ? collectElements(document)
      : [];
  const images = include.has("images") ? collectImages(root, target) : [];
  const links = include.has("links") ? collectLinks(root) : [];
  const forms = include.has("forms") ? collectForms(root) : [];

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
  };
}
