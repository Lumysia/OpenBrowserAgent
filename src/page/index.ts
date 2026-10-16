import { errorMessage } from "../shared/error-message";
import { beginChanges, collectChanges, hasBaseline } from "./changes";
import {
  editableText,
  hasText,
  prepareTrustedInput,
  runStep,
  type ActStep,
} from "./actions";
import { inputPoint } from "./pointer-actions";
import { runEdits, type EditOp } from "./edits";
import { mainMarkdown } from "./html-markdown";
import { pageMarkdown } from "./markdown";
import {
  raiseFloor,
  refCounter,
  resolveRef,
  RefError,
  takeRefNotes,
} from "./refs";
import { findLines } from "./search";
import { searchResults } from "./search-results";
import { renderLines, snapshotLines } from "./snapshot";

// The in-page side of the page tools, installed once per document in the
// extension's isolated world. Every method takes plain JSON and returns
// plain JSON (or a promise of it); `refFloor` keeps refs unique across
// documents and tabs.

const PAGE_ITEM_CAP = 50;
const FULL_PAGE_MAX_CHARS = 400_000;
// A page taller than the window by this share scrolls (and says where).
const SCROLLS_SHARE = 1.2;

type Args = Record<string, unknown> & { refFloor?: number };

function snapshot(args: Args) {
  const capChars = requiredNumber(args, "capChars");
  const urls = args.urls === true;
  const scope = String(args.scope || "auto");
  const page = (root: Element, itemCap?: number) =>
    renderLines(
      snapshotLines(root, {
        mode: "page",
        urls,
        itemCap,
        maxChars: FULL_PAGE_MAX_CHARS,
      }),
    );
  if (args.ref) return { scope: "ref", text: page(resolveRef(args.ref)) };
  const body = document.body || document.documentElement;
  if (scope === "viewport") return { scope, text: viewport(body, urls) };
  // The whole page when it fits; otherwise `page` caps long lists and
  // tables, and auto shows the viewport plus the whole page for read and find.
  const full = page(body);
  if (scope === "page" && full.length > capChars)
    return { scope, text: scrollNote() + page(body, PAGE_ITEM_CAP) };
  if (full.length <= capChars)
    return { scope: "page", text: `${scrollNote()}${full}` };
  return { scope: "viewport", text: viewport(body, urls), full };
}

// Where the page is scrolled, when it can scroll: content that loads on
// scroll only exists after scrolling.
function scrollNote() {
  const height = document.documentElement.scrollHeight;
  if (height <= innerHeight * SCROLLS_SHARE) return "";
  const top = Math.round(scrollY);
  return `[Scrolled to y=${top}-${top + innerHeight} of ${height}px.]\n`;
}

function viewport(body: Element, urls: boolean) {
  const height = document.documentElement.scrollHeight;
  const top = Math.round(scrollY);
  const header = `[Viewport y=${top}-${top + innerHeight} of ${height}px; content outside it is not shown. Scroll with act, or use find.]`;
  return `${header}\n${renderLines(snapshotLines(body, { mode: "viewport", urls }))}`;
}

// Limits come from the caller (the background's tool policy), never a
// second default here.
function requiredNumber(args: Args, name: string) {
  const value = Number(args[name]);
  if (!Number.isFinite(value)) throw new Error(`Missing ${name}`);
  return value;
}

const methods: Record<string, (args: Args) => unknown> = {
  snapshot,
  find: (args) =>
    findLines(String(args.query || ""), requiredNumber(args, "limit")),
  markdown: () => ({
    text: pageMarkdown(document.body || document.documentElement),
  }),
  // The page's main content with whole links, for copying.
  mainMarkdown: () => ({ text: mainMarkdown(document, "") }),
  step: async (args) => {
    const result = await runStep(args.step as ActStep);
    const notes = takeRefNotes();
    if (!notes.length) return result;
    return {
      ...result,
      note: [...notes, result.note].filter(Boolean).join("; "),
    };
  },
  begin: () => beginChanges(),
  sameDocument: () => hasBaseline(),
  changes: () => collectChanges(),
  edits: (args) => runEdits((args.ops as EditOp[]) || []),
  hasText: (args) => hasText(String(args.text || "")),
  prepareTrusted: (args) =>
    prepareTrustedInput(String(args.ref || ""), args.clear !== false),
  editableText: (args) => editableText(String(args.ref || "")),
  inputPoint: (args) =>
    inputPoint(String(args.ref || ""), {
      focus: args.focus === true,
      pointer: args.pointer === true,
      force: args.force === true,
    }),
  searchResults: (args) => searchResults(requiredNumber(args, "limit")),
};

export type PageAgentReply =
  | { ok: true; value: unknown; refCounter: number; title: string; url: string }
  | { ok: false; error: string; refError: boolean; refCounter: number };

export function installPageAgent() {
  const scope = globalThis as typeof globalThis & {
    __obaPageAgent?: (method: string, args: Args) => Promise<PageAgentReply>;
  };
  if (scope.__obaPageAgent) return;
  // Methods may answer later (typing waits for the editor to render);
  // executeScript passes the promise's value back.
  scope.__obaPageAgent = async (method, args) => {
    raiseFloor(args?.refFloor);
    takeRefNotes();
    try {
      const run = methods[method];
      if (!run) throw new Error(`Unknown page method ${method}`);
      const value = await run(args || {});
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
        error: errorMessage(error),
        refError: error instanceof RefError,
        refCounter: refCounter(),
      };
    }
  };
}
