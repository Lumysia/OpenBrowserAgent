import { beginChanges, collectChanges } from "./changes";
import {
  editableText,
  hasText,
  prepareTrustedInput,
  runStep,
  type ActStep,
} from "./actions";
import { runEdits, type EditOp } from "./edits";
import { pageMarkdown } from "./markdown";
import { raiseFloor, refCounter, resolveRef, RefError } from "./refs";
import { findLines, searchResults } from "./search";
import { renderLines, snapshotLines } from "./snapshot";

// The in-page side of the page tools, installed once per document in the
// extension's isolated world. Every method takes plain JSON and returns
// plain JSON; `refFloor` keeps refs unique across documents and tabs.

const PAGE_ITEM_CAP = 50;
const FULL_PAGE_MAX_CHARS = 400_000;

type Args = Record<string, unknown> & { refFloor?: number };

function snapshot(args: Args) {
  const capChars = Number(args.capChars) || 17_500;
  const urls = args.urls === true;
  const scope = String(args.scope || "auto");
  if (args.ref) {
    const root = resolveRef(args.ref);
    const { lines } = snapshotLines(root, {
      mode: "page",
      urls,
      maxChars: FULL_PAGE_MAX_CHARS,
    });
    return { scope: "ref", text: renderLines(lines) };
  }
  const body = document.body || document.documentElement;
  if (scope === "viewport") return { scope, text: viewport(body, urls) };
  if (scope === "page")
    return {
      scope,
      text:
        scrollNote() +
        renderLines(
          snapshotLines(body, {
            mode: "page",
            itemCap: PAGE_ITEM_CAP,
            urls,
            maxChars: FULL_PAGE_MAX_CHARS,
          }).lines,
        ),
    };
  // Auto: the whole page when it fits, else the viewport plus the whole
  // page for read and find.
  const full = renderLines(
    snapshotLines(body, { mode: "page", urls, maxChars: FULL_PAGE_MAX_CHARS })
      .lines,
  );
  if (full.length <= capChars)
    return { scope: "page", text: `${scrollNote()}${full}` };
  return { scope: "viewport", text: viewport(body, urls), full };
}

// Where the page is scrolled, when it can scroll: content that loads on
// scroll only exists after scrolling.
function scrollNote() {
  const height = document.documentElement.scrollHeight;
  if (height <= innerHeight * 1.2) return "";
  const top = Math.round(scrollY);
  return `[Scrolled to y=${top}-${top + innerHeight} of ${height}px.]\n`;
}

function viewport(body: Element, urls: boolean) {
  const height = document.documentElement.scrollHeight;
  const top = Math.round(scrollY);
  const header = `[Viewport y=${top}-${top + innerHeight} of ${height}px; content outside it is not shown. Scroll with act, or use find.]`;
  const { lines } = snapshotLines(body, { mode: "viewport", urls });
  return `${header}\n${renderLines(lines)}`;
}

const methods: Record<string, (args: Args) => unknown> = {
  snapshot,
  find: (args) => findLines(String(args.query || ""), Number(args.limit) || 30),
  markdown: () => ({
    text: pageMarkdown(document.body || document.documentElement),
  }),
  step: (args) => runStep(args.step as ActStep),
  begin: () => beginChanges(),
  changes: () => collectChanges(),
  edits: (args) => runEdits((args.ops as EditOp[]) || []),
  hasText: (args) => hasText(String(args.text || "")),
  prepareTrusted: (args) =>
    prepareTrustedInput(String(args.ref || ""), args.clear !== false),
  editableText: (args) => editableText(String(args.ref || "")),
  searchResults: (args) => searchResults(Number(args.limit) || 10),
};

export type PageAgentReply =
  | { ok: true; value: unknown; refCounter: number; title: string; url: string }
  | { ok: false; error: string; refError: boolean; refCounter: number };

export function installPageAgent() {
  const scope = globalThis as typeof globalThis & {
    __obaPageAgent?: (method: string, args: Args) => PageAgentReply;
  };
  if (scope.__obaPageAgent) return;
  scope.__obaPageAgent = (method, args) => {
    raiseFloor(args?.refFloor);
    try {
      const run = methods[method];
      if (!run) throw new Error(`Unknown page method ${method}`);
      const value = run(args || {});
      return {
        ok: true,
        value,
        refCounter: refCounter(),
        title: document.title,
        url: location.href,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        refError: error instanceof RefError,
        refCounter: refCounter(),
      };
    }
  };
}
