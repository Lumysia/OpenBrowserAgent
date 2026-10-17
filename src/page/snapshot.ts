import { HEADING_TAGS } from "../shared/dom-vocabulary";
import { compact } from "../shared/text";
import {
  children,
  clip,
  CONTAINER_ROLES,
  headingLevel,
  inViewport,
  isBlock,
  isHidden,
  isInteractive,
  namedFrom,
  nameOf,
  roleOf,
} from "./dom";
import { nameSourceNote } from "./guessed-name";
import { refFor } from "./refs";

// The page as one line per meaningful node:
//   - heading [e3] h1: Web browser
//   - paragraph [e4]: A web browser is [application software](e5) for …
//   - textbox "Email" [e9] value="a@b.c"
// Interactive elements and text blocks carry refs; generic wrappers add no
// line. Text stays inline (links as [text](ref)), so nothing is repeated.

type SnapshotMode = "viewport" | "page" | "all";

type SnapshotOptions = {
  mode: SnapshotMode;
  // Long lists and tables show this many items, with a count of the rest.
  itemCap?: number;
  urls?: boolean;
  maxChars?: number;
};

export type Line = { depth: number; text: string };

const NAME_MAX = 100;
const VALUE_MAX = 80;
const BLOCK_TEXT_MAX = 2_000;
const CELL_TEXT_MAX = 200;
const SELECT_OPTIONS_SHOWN = 8;
const VIEWPORT_MARGIN = 80;
// Roles of native fields that take typed text.
const TEXT_FIELD_ROLES = new Set(["textbox", "searchbox", "spinbutton"]);
const TEXT_ROLES = new Set([
  "paragraph",
  "listitem",
  "blockquote",
  "code",
  "caption",
  "term",
  "definition",
  "label",
  "cell",
  "columnheader",
  "rowheader",
]);

export function snapshotLines(root: Element, options: SnapshotOptions) {
  const lines: Line[] = [];
  let chars = 0;
  const limit = options.maxChars ?? Infinity;
  const full = () => chars > limit;
  const push = (depth: number, text: string) => {
    if (full()) return;
    lines.push({ depth, text });
    chars += text.length + depth * 2 + 3;
  };
  const visible = (element: Element) =>
    !isHidden(element) &&
    (options.mode !== "viewport" || inViewport(element, VIEWPORT_MARGIN));

  const inline = (node: Node, max = BLOCK_TEXT_MAX): string =>
    clip(compact(inlineText(node, options)), max);

  function visitChildren(parent: Element, depth: number) {
    let run: Node[] = [];
    const flush = () => {
      const text = compact(
        run.map((node) => inlineText(node, options)).join(""),
      );
      if (text) push(depth, `- text: ${clip(text, BLOCK_TEXT_MAX)}`);
      run = [];
    };
    for (const child of children(parent)) {
      if (full()) return;
      if (child.nodeType === Node.TEXT_NODE) {
        run.push(child);
        continue;
      }
      if (!(child instanceof Element)) continue;
      if (isHidden(child)) continue;
      if (isInlineNode(child)) {
        run.push(child);
        continue;
      }
      flush();
      visit(child, depth);
    }
    flush();
  }

  function visit(element: Element, depth: number) {
    if (full() || !visible(element)) return;
    const role = roleOf(element);
    if (isInteractive(element, role) && role !== "listbox") {
      push(depth, controlLine(element, role, options));
      return;
    }
    if (role === "heading") {
      push(
        depth,
        `- heading [${refFor(element)}] h${headingLevel(element)}: ${inline(element, NAME_MAX * 3)}`,
      );
      return;
    }
    if (role === "img") {
      const name = nameOf(element, role);
      if (name)
        push(
          depth,
          `- img "${clip(name, NAME_MAX)}"${options.urls && element instanceof HTMLImageElement ? ` ${element.currentSrc || element.src}` : ""}`,
        );
      return;
    }
    if (role === "iframe") {
      push(depth, frameLine(element as HTMLIFrameElement));
      return;
    }
    if (role === "video" || role === "audio") {
      const name = nameOf(element, role);
      push(depth, `- ${role}${name ? ` "${clip(name, NAME_MAX)}"` : ""}`);
      return;
    }
    if (role === "separator") return;
    if (element.localName === "table" && isDataTable(element)) {
      table(element, depth);
      return;
    }
    if (CONTAINER_ROLES.has(role)) {
      container(element, role, depth);
      return;
    }
    if (hasBlockContent(element)) {
      if (TEXT_ROLES.has(role)) {
        push(depth, `- ${role} [${refFor(element)}]:`);
        visitChildren(element, depth + 1);
      } else visitChildren(element, depth);
      return;
    }
    // A wrapper around one control (a list item holding one link) is just
    // that control.
    const control = soleControl(element);
    if (control) {
      push(depth, controlLine(control, roleOf(control), options));
      return;
    }
    const text = inline(element);
    if (text)
      push(
        depth,
        `- ${TEXT_ROLES.has(role) ? role : "text"} [${refFor(element)}]: ${text}`,
      );
  }

  function container(element: Element, role: string, depth: number) {
    const name = nameOf(element, role);
    const items =
      role === "list"
        ? children(element).filter(
            (child): child is Element =>
              child instanceof Element && !isHidden(child),
          )
        : [];
    const count = role === "list" ? ` (${items.length} items)` : "";
    push(
      depth,
      `- ${role}${name ? ` "${clip(name, NAME_MAX)}"` : ""} [${refFor(element)}]${count}:`,
    );
    const cap = options.itemCap;
    if (role === "list" && cap && items.length > cap) {
      items.slice(0, cap).forEach((item) => visit(item, depth + 1));
      push(
        depth + 1,
        `- … ${items.length - cap} more items (snapshot ref=${refFor(element)} shows all)`,
      );
      return;
    }
    visitChildren(element, depth + 1);
  }

  function table(element: Element, depth: number) {
    const rows = Array.from((element as HTMLTableElement).rows || []).filter(
      (row) => !isHidden(row) && visible(row),
    );
    const caption = compact((element as HTMLTableElement).caption?.innerText);
    push(
      depth,
      `- table${caption ? ` "${clip(caption, NAME_MAX)}"` : ""} [${refFor(element)}] (${(element as HTMLTableElement).rows.length} rows):`,
    );
    const cap = options.itemCap;
    const shown = cap && rows.length > cap ? rows.slice(0, cap) : rows;
    for (const row of shown) {
      const cells = Array.from(row.cells).filter((cell) => !isHidden(cell));
      const header =
        cells.length > 0 && cells.every((cell) => cell.localName === "th");
      const text = cells.map((cell) => inline(cell, CELL_TEXT_MAX)).join(" | ");
      if (text.replace(/[|\s]/g, ""))
        push(depth + 1, `- ${header ? "header" : "row"}: ${text}`);
    }
    if (shown.length < rows.length)
      push(
        depth + 1,
        `- … ${rows.length - shown.length} more rows (snapshot ref=${refFor(element)} shows all, or use find)`,
      );
    if (options.mode !== "viewport")
      for (const line of columnCounts(element as HTMLTableElement))
        push(depth + 1, line);
  }

  visit(root, 0);
  return { lines, truncated: full() };
}

// Page tools read the top document only; a frame's content is named, not
// shown.
function frameLine(frame: HTMLIFrameElement) {
  const name = nameOf(frame, "iframe");
  const url = frame.getAttribute("src") ? frame.src : "";
  return `- iframe${name ? ` "${clip(name, NAME_MAX)}"` : ""}${url ? ` ${url}` : ""} (content not included${url ? "; open its URL in a tab to read it" : ""})`;
}

export function renderLines({
  lines,
  truncated,
}: {
  lines: Line[];
  truncated?: boolean;
}) {
  const text = lines
    .map((line) => `${"  ".repeat(line.depth)}${line.text}`)
    .join("\n");
  return truncated
    ? `${text}\n[Snapshot cut at ${text.length} characters: the rest is missing. Use find, or snapshot ref= on a later part.]`
    : text;
}

function controlLine(element: Element, role: string, options: SnapshotOptions) {
  const parts = [`- ${role}${quotedName(element, role)} [${refFor(element)}]`];
  const states = controlStates(element, role, options);
  if (states) parts.push(states);
  return parts.join(" ");
}

// ` "Name"`, with where a guessed name came from; "" without a name.
function quotedName(element: Element, role: string) {
  const named = namedFrom(element, role);
  return named.name
    ? ` "${clip(named.name, NAME_MAX)}"${nameSourceNote(named)}`
    : "";
}

function controlStates(
  element: Element,
  role: string,
  options: SnapshotOptions,
) {
  const states: string[] = [];
  const attr = (name: string) => element.getAttribute(name);
  if (element instanceof HTMLSelectElement) {
    const selected = Array.from(element.selectedOptions)
      .map((option) => compact(option.text))
      .join(", ");
    states.push(`value="${clip(selected, VALUE_MAX)}"`);
    const all = Array.from(element.options).map((option) =>
      compact(option.text),
    );
    const shown =
      options.mode === "all" ? all : all.slice(0, SELECT_OPTIONS_SHOWN);
    states.push(
      `options(${all.length}): ${shown.join(", ")}${shown.length < all.length ? ", …" : ""}`,
    );
  } else if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement
  ) {
    const type = element instanceof HTMLInputElement ? element.type : "text";
    if (type === "checkbox" || type === "radio")
      states.push(
        (element as HTMLInputElement).checked ? "checked" : "unchecked",
      );
    else if (type === "password")
      states.push(element.value ? 'value="•••"' : 'value=""');
    else if (!["button", "submit", "reset", "image", "file"].includes(type))
      states.push(`value="${clip(element.value, VALUE_MAX)}"`);
    if (type !== "text" && type !== "textarea" && role === "textbox")
      states.push(`type=${type}`);
  } else if (role === "textbox" && (element as HTMLElement).isContentEditable) {
    states.push(
      `value="${clip(compact((element as HTMLElement).innerText), VALUE_MAX)}"`,
    );
  }
  const checked = attr("aria-checked");
  if (checked && !(element instanceof HTMLInputElement))
    states.push(
      checked === "true"
        ? "checked"
        : checked === "mixed"
          ? "mixed"
          : "unchecked",
    );
  if (attr("aria-pressed") === "true") states.push("pressed");
  if (attr("aria-selected") === "true") states.push("selected");
  const expanded = attr("aria-expanded");
  if (expanded) states.push(`expanded=${expanded}`);
  if (
    element instanceof HTMLDetailsElement ||
    element.parentElement instanceof HTMLDetailsElement
  )
    if (element.localName === "summary")
      states.push(
        `expanded=${(element.parentElement as HTMLDetailsElement).open}`,
      );
  if (
    (element as HTMLButtonElement).disabled ||
    attr("aria-disabled") === "true"
  )
    states.push("disabled");
  const field = element as Partial<HTMLInputElement>;
  // HTML ignores readonly on fields that take no text.
  if (
    (TEXT_FIELD_ROLES.has(role) && field.readOnly === true) ||
    attr("aria-readonly") === "true"
  )
    states.push("readonly");
  if (field.required === true || attr("aria-required") === "true")
    states.push("required");
  if (attr("aria-invalid") === "true") states.push("invalid");
  if (options.urls && element instanceof HTMLAnchorElement && element.href)
    states.push(`→ ${element.href}`);
  return states.join(" ");
}

// Inline content as text; controls inside appear with their refs.
function inlineText(
  node: Node,
  options: Pick<SnapshotOptions, "urls">,
): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
  if (!(node instanceof Element)) return "";
  if (isHidden(node)) return "";
  if (node.localName === "br") return " ";
  const role = roleOf(node);
  if (role === "link") {
    const text = compact((node as HTMLElement).innerText);
    const named = text ? { name: text } : namedFrom(node, role);
    const url = options.urls ? ` ${(node as HTMLAnchorElement).href}` : "";
    return named.name
      ? ` [${clip(named.name, NAME_MAX * 2)}${nameSourceNote(named)}](${refFor(node)}${url}) `
      : "";
  }
  if (isInteractive(node, role) && role !== "clickable") {
    const states = controlStates(node, role, {
      mode: "page",
      urls: options.urls,
    });
    return ` [${role}${quotedName(node, role)} ${refFor(node)}${states ? ` ${states}` : ""}] `;
  }
  if (role === "img" || node.localName === "svg") return "";
  const parts = children(node).map((child) => inlineText(child, options));
  const block = isBlockish(node) ? " " : "";
  return `${block}${parts.join("")}${block}`;
}

function isBlockish(element: Element) {
  return (
    element.localName === "td" ||
    element.localName === "th" ||
    element.localName === "li" ||
    element.localName === "p" ||
    element.localName === "div"
  );
}

const OWN_LINE_ROLES = new Set(["iframe", "video", "audio"]);

function isInlineNode(element: Element) {
  const role = roleOf(element);
  if (CONTAINER_ROLES.has(role) || OWN_LINE_ROLES.has(role)) return false;
  if (element.localName === "table") return false;
  return !isBlock(element) && !hasBlockContent(element);
}

function hasBlockContent(element: Element): boolean {
  for (const child of children(element)) {
    if (!(child instanceof Element) || isHidden(child)) continue;
    const role = roleOf(child);
    if (role === "heading" || CONTAINER_ROLES.has(role)) return true;
    if (child.localName === "table") return true;
    if (isBlock(child)) return true;
    if (!isInteractive(child, role) && hasBlockContent(child)) return true;
  }
  return false;
}

const COUNTED_MIN_ROWS = 20;
const COUNTED_MAX_VALUES = 8;

// How often each value occurs in columns of few distinct values (a status,
// a category) of a long table: counting rows by eye is error-prone.
function columnCounts(table: HTMLTableElement) {
  const rows = Array.from(table.rows).filter((row) => !isHidden(row));
  const head = rows.findIndex(
    (row) =>
      row.cells.length &&
      Array.from(row.cells).every((cell) => cell.localName === "th"),
  );
  const names =
    head >= 0
      ? Array.from(rows[head].cells).map((cell) => compact(cell.textContent))
      : [];
  const body = rows.filter((row, index) => index !== head && row.cells.length);
  if (body.length < COUNTED_MIN_ROWS) return [];
  const lines: string[] = [];
  const columns = Math.max(...body.map((row) => row.cells.length));
  for (let column = 0; column < columns; column++) {
    const counts = new Map<string, number>();
    for (const row of body) {
      const value = compact(row.cells[column]?.textContent);
      if (value) counts.set(value, (counts.get(value) || 0) + 1);
    }
    if (
      counts.size < 2 ||
      counts.size > COUNTED_MAX_VALUES ||
      counts.size > body.length / 4
    )
      continue;
    const name = names[column] || `column ${column + 1}`;
    lines.push(
      `- counts of ${clip(name, NAME_MAX)} (${body.length} rows): ${[...counts]
        .sort((a, b) => b[1] - a[1])
        .map(([value, count]) => `${clip(value, CELL_TEXT_MAX)} ${count}`)
        .join(", ")}`,
    );
  }
  return lines;
}

// Layout tables (cells holding tables or block structure) are walked as
// ordinary containers instead of rows.
const LAYOUT_CELL_SELECTOR = [
  ...HEADING_TAGS,
  "ul",
  "ol",
  "p",
  "div > div",
].join(",");

function isDataTable(table: Element) {
  if (table.querySelector("table")) return false;
  const rows = (table as HTMLTableElement).rows;
  if (!rows?.length) return false;
  for (const cell of Array.from(rows[0].cells))
    if (cell.querySelector(LAYOUT_CELL_SELECTOR)) return false;
  return true;
}

// The one interactive element that is all of `element`'s visible content.
function soleControl(element: Element): Element | undefined {
  let found: Element | undefined;
  const walk = (node: Node): boolean => {
    if (node.nodeType === Node.TEXT_NODE) return !compact(node.textContent);
    if (!(node instanceof Element) || isHidden(node)) return true;
    if (isInteractive(node)) {
      if (found) return false;
      found = node;
      return true;
    }
    return children(node).every(walk);
  };
  return children(element).every(walk) ? found : undefined;
}
