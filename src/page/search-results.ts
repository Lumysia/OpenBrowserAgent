import { HEADING_SELECTOR } from "../shared/dom-vocabulary";
import { compact } from "../shared/text";
import { clip, isBlock, isHidden, roleOf } from "./dom";

// Organic results of a search engine page, read from page structure rather
// than per-engine selectors. Results are the repeated sibling blocks of one
// list, each holding a prominent link that leaves the engine's site; the
// title is the link's heading or most prominent text line, the snippet the
// rest of the block's own text.

type SearchResult = { title: string; url: string; snippet: string };

const SNIPPET_MAX = 300;
// Text beyond the title and URL that makes a block a described result.
const SNIPPET_MIN = 40;
const LIST_MIN = 3;
const LANDMARKS = new Set([
  "navigation",
  "banner",
  "contentinfo",
  "complementary",
  "search",
  "dialog",
]);
// Words that mark sponsored blocks in class names, ids and attribute names.
// A heuristic: engines label ads for users in their own language, but name
// their markup in English; a miss shows an ad as a result, nothing is lost.
const AD_WORDS = new Set([
  "ad",
  "ads",
  "adv",
  "advert",
  "advertisement",
  "sponsored",
  "promoted",
]);
// Breadcrumb or display URL: "https://site › path", "site.com/path".
const URL_LIKE =
  /^(https?:\/\/|www\.)|[›»]|^[\p{L}\d-]+(\.[\p{L}\d-]+)+(\/\S*)?$/iu;

type Title = { text: string; heading: boolean; size: number };
type Candidate = { link: HTMLAnchorElement; url: string; title?: Title };

export function searchResults(limit: number): SearchResult[] {
  const candidates = outboundLinks();
  const records = resultBlocks(candidates);
  const results: SearchResult[] = [];
  const seen = new Set<string>();
  for (const record of records) {
    const result = readRecord(
      record,
      candidates.filter(({ link }) => record.contains(link)),
    );
    if (!result || seen.has(result.url)) continue;
    seen.add(result.url);
    results.push(result);
    if (results.length >= limit) break;
  }
  return results;
}

// Visible links outside page chrome that lead off the engine's site, with
// redirect wrappers removed.
function outboundLinks(): Candidate[] {
  const host = siteHost(location.hostname);
  const links: Candidate[] = [];
  for (const link of Array.from(document.querySelectorAll("a[href]"))) {
    if (!(link instanceof HTMLAnchorElement)) continue;
    const url = targetUrl(link, host);
    if (!url || isHidden(link) || inChrome(link)) continue;
    links.push({ link, url, title: linkTitle(link) });
  }
  return links;
}

function siteHost(hostname: string) {
  return hostname.replace(/^www\./, "");
}

function isOffSite(url: URL, host: string) {
  if (!/^https?:$/.test(url.protocol)) return false;
  const target = siteHost(url.hostname);
  return target !== host && !target.endsWith(`.${host}`);
}

function targetUrl(link: HTMLAnchorElement, host: string) {
  let url: URL;
  try {
    url = new URL(link.href);
  } catch {
    return "";
  }
  if (isOffSite(url, host)) return url.href;
  // Opaque redirects (a token instead of the URL) leave the target only in
  // an attribute of the link or its block.
  return redirectTarget(url, host)?.href || attributeUrl(link, host);
}

// Engines link results through their own redirect URLs, the target in a
// query parameter or a `key=value` path segment, written out or base64url
// encoded (after a short prefix). The first off-site address is the target;
// no engine's parameter names are assumed.
function redirectTarget(url: URL, host: string) {
  const values = [...url.searchParams.values(), ...pathValues(url)];
  for (const value of values) {
    const target = embeddedUrl(value);
    if (target && isOffSite(target, host)) return target;
  }
  return undefined;
}

function pathValues(url: URL) {
  return url.pathname.split("/").flatMap((segment) => {
    const value = segment.match(/^[^=]+=(.+)$/)?.[1];
    if (!value) return [];
    try {
      return [decodeURIComponent(value)];
    } catch {
      return [];
    }
  });
}

// Characters before a base64url-encoded address (a format version).
const ENCODED_PREFIX_MAX = 2;
const ABSOLUTE_URL = /^https?:\/\/\S+$/i;

function embeddedUrl(value: string) {
  const candidates = [value];
  if (/^[\w-]+=*$/.test(value))
    for (let skip = 0; skip <= ENCODED_PREFIX_MAX; skip++)
      candidates.push(decodeBase64Url(value.slice(skip)));
  for (const candidate of candidates)
    if (ABSOLUTE_URL.test(candidate))
      try {
        return new URL(candidate);
      } catch {
        // Not a valid address.
      }
  return undefined;
}

function decodeBase64Url(value: string) {
  try {
    return atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  } catch {
    return "";
  }
}

const ATTRIBUTE_URL_DEPTH = 10;
// Attributes that point at the engine's own assets rather than a target.
const RESOURCE_ATTRIBUTE = /src|path|img|image|icon|logo|style|css|script/i;

function attributeUrl(link: Element, host: string) {
  let element: Element | null = link;
  for (let level = 0; element && level < ATTRIBUTE_URL_DEPTH; level++) {
    for (const attribute of Array.from(element.attributes)) {
      if (attribute.name === "href" || RESOURCE_ATTRIBUTE.test(attribute.name))
        continue;
      if (!/^https?:\/\/\S+$/.test(attribute.value)) continue;
      try {
        const url = new URL(attribute.value);
        if (isOffSite(url, host)) return url.href;
      } catch {
        // Not a URL.
      }
    }
    element = element.parentElement;
  }
  return "";
}

function inChrome(element: Element) {
  for (let node: Element | null = element; node; node = node.parentElement)
    if (LANDMARKS.has(roleOf(node)) || node.localName === "form") return true;
  return false;
}

// Ad markers between a link and its result block. Higher up they may wrap
// the whole page (ad slots of the results area).
function isSponsored(link: Element, record: Element) {
  for (
    let node: Element | null = link;
    node && record.contains(node);
    node = node.parentElement
  ) {
    const names = [
      node.id,
      node.getAttribute("class") || "",
      ...node.getAttributeNames().filter((name) => name.startsWith("data-")),
    ].join(" ");
    for (const word of names
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .split(/[\s_-]+/))
      if (AD_WORDS.has(word.toLowerCase())) return true;
  }
  return false;
}

// The result blocks: the most frequent level of elements holding a titled
// outbound link, keyed by depth and tag so that lists the engine splits
// into several containers stay one list. Elements come in document order.
function resultBlocks(candidates: Candidate[]) {
  const groups = new Map<string, { depth: number; items: Set<Element> }>();
  for (const { link, title } of candidates) {
    if (!title) continue;
    const chain: Element[] = [];
    for (let node: Element | null = link; node; node = node.parentElement)
      chain.unshift(node);
    for (let depth = 1; depth < chain.length; depth++) {
      const key = `${depth} ${chain[depth - 1].localName} ${chain[depth].localName}`;
      const group = groups.get(key) || { depth, items: new Set<Element>() };
      group.items.add(chain[depth]);
      groups.set(key, group);
    }
  }
  // Results describe their page, so the list with the most described items
  // wins over carousels of bare links (products, videos). Wrappers inside
  // each block repeat as often as the blocks themselves: the outermost of
  // equally good levels is the whole block.
  let best: { score: number[]; items: Element[] } | undefined;
  for (const group of groups.values()) {
    const items = listed(alike(Array.from(group.items)));
    if (!items.length) continue;
    const described = items.filter(
      (item) => snippetOf(item, "").length >= SNIPPET_MIN,
    ).length;
    const score = [described, items.length, -group.depth];
    if (!best || isGreater(score, best.score)) best = { score, items };
  }
  return best ? best.items : headingBlocks(candidates);
}

// Too few results for a list: links titled by a heading, each with the
// surroundings that hold no other such link.
function headingBlocks(candidates: Candidate[]) {
  const titled = candidates.filter(({ title }) => title?.heading);
  return titled.map(({ link }) => {
    let block: Element = link;
    while (
      block.parentElement &&
      block.parentElement !== document.body &&
      titled.every(
        (other) =>
          other.link === link || !block.parentElement!.contains(other.link),
      )
    )
      block = block.parentElement;
    return block;
  });
}

// Items that are entries of a list: siblings of at least LIST_MIN others
// of the group. Parts of one block (title row, sitelinks, cache links) repeat
// once or twice per parent instead.
function listed(items: Element[]) {
  const counts = new Map<Element | null, number>();
  for (const item of items)
    counts.set(item.parentElement, (counts.get(item.parentElement) || 0) + 1);
  return items.filter((item) => counts.get(item.parentElement)! >= LIST_MIN);
}

// Items carrying the classes most items share; leaves out other modules at
// the same level while ignoring positional classes like "first".
function alike(items: Element[]) {
  const counts = new Map<string, number>();
  for (const item of items)
    for (const name of new Set(Array.from(item.classList)))
      counts.set(name, (counts.get(name) || 0) + 1);
  const core = Array.from(counts)
    .filter(([, count]) => count * 2 > items.length)
    .map(([name]) => name);
  return items.filter((item) =>
    core.every((name) => item.classList.contains(name)),
  );
}

function readRecord(
  record: Element,
  links: Candidate[],
): SearchResult | undefined {
  let main: { url: string; title: string; score: number[] } | undefined;
  for (const { link, url, title } of links) {
    if (isSponsored(link, record)) return undefined;
    if (!title) continue;
    const score = [title.heading ? 1 : 0, title.size];
    if (!main || isGreater(score, main.score))
      main = { url, title: title.text, score };
  }
  if (!main || isModule(record)) return undefined;
  return {
    title: main.title,
    url: main.url,
    snippet: clip(snippetOf(record, main.title), SNIPPET_MAX),
  };
}

// A block with a heading of its own, outside any link ("Top stories",
// "Videos", "People also ask"), groups other content rather than being one
// result.
function isModule(record: Element) {
  return Array.from(
    record.querySelectorAll(`${HEADING_SELECTOR}, header`),
  ).some(
    (heading) =>
      !heading.closest("a[href]") &&
      !heading.querySelector("a[href]") &&
      !isHidden(heading),
  );
}

// The heading a link holds or sits in; else its most prominent text line
// (largest font, then longest) that is not a breadcrumb or display URL.
function linkTitle(link: Element): Title | undefined {
  const heading =
    link.closest(HEADING_SELECTOR) || link.querySelector(HEADING_SELECTOR);
  if (heading && !isHidden(heading)) {
    const text = compact(heading.textContent);
    if (text) return { text, heading: true, size: fontSize(heading) };
  }
  const blocks = new Set<Element>();
  for (const element of [link, ...Array.from(link.querySelectorAll("*"))]) {
    const own = Array.from(element.childNodes).some(
      (node) => node.nodeType === Node.TEXT_NODE && compact(node.textContent),
    );
    if (own) blocks.add(lineOf(element, link));
  }
  const lines = Array.from(blocks)
    .filter((line) => !isHidden(line))
    .map((line) => ({ line, text: compact((line as HTMLElement).innerText) }));
  const urls = lines
    .filter(({ line, text }) => line.closest("cite") || URL_LIKE.test(text))
    .map(({ line }) => line);
  let best: (Title & { score: number[] }) | undefined;
  for (const { line, text } of lines) {
    if (!text || urls.includes(line)) continue;
    // A line boxed together with the display URL is the site name.
    const box = line.parentElement;
    const site = box !== link && urls.some((url) => box?.contains(url));
    const size = fontSize(line);
    const score = [site ? 0 : 1, size, text.length];
    if (!best || isGreater(score, best.score))
      best = { text, heading: false, size, score };
  }
  return best && { text: best.text, heading: false, size: best.size };
}

function isGreater(a: number[], b: number[]) {
  const index = a.findIndex((value, at) => value !== b[at]);
  return index >= 0 && a[index] > b[index];
}

// The block a piece of text belongs to, within the link.
function lineOf(element: Element, link: Element) {
  let node = element;
  while (node !== link && !isBlock(node) && node.parentElement)
    node = node.parentElement;
  return node;
}

function fontSize(element: Element) {
  return parseFloat(getComputedStyle(element).fontSize) || 0;
}

// The block's text outside links, buttons and display URLs.
function snippetOf(record: Element, title: string) {
  const parts: string[] = [];
  const walker = document.createTreeWalker(record, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    const text = compact(node.textContent);
    if (!parent || !text || URL_LIKE.test(text)) continue;
    if (parent.closest("a, button, cite, [role=button], [role=menu]")) continue;
    if (isHidden(parent)) continue;
    parts.push(text);
  }
  return compact(parts.join(" ").replace(title, ""));
}
