import {
  children,
  compact,
  headingLevel,
  isBlock,
  isHidden,
  roleOf,
} from "./dom";

// Readable page text as Markdown for `read`: headings, paragraphs, lists,
// tables, quotes, code, and links with their URLs. Navigation chrome is left
// out; the snapshot covers it.

const SKIPPED_ROLES = new Set([
  "navigation",
  "banner",
  "contentinfo",
  "search",
]);

export function pageMarkdown(root: Element = document.body) {
  const blocks: string[] = [];
  const origin = location.origin;

  const link = (element: HTMLAnchorElement, text: string) => {
    if (!text) return "";
    const href = element.href || "";
    if (!href || href.startsWith("javascript:")) return text;
    const url = href.startsWith(origin)
      ? href.slice(origin.length) || "/"
      : href;
    return `[${text}](${url})`;
  };

  const inline = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
    if (!(node instanceof Element) || isHidden(node)) return "";
    if (node.localName === "br") return "\n";
    if (node.localName === "img") {
      const alt = compact(node.getAttribute("alt"));
      return alt ? `[image: ${alt}]` : "";
    }
    const text = children(node).map(inline).join("");
    if (node instanceof HTMLAnchorElement) return link(node, compact(text));
    if (node.localName === "code") return `\`${text}\``;
    if (["b", "strong"].includes(node.localName) && compact(text))
      return `**${compact(text)}**`;
    if (["i", "em"].includes(node.localName) && compact(text))
      return `*${compact(text)}*`;
    return isBlock(node) ? ` ${text} ` : text;
  };
  const text = (node: Node) =>
    inline(node)
      .split("\n")
      .map((line) => compact(line))
      .join("\n")
      .trim();

  const walk = (element: Element, prefix = "") => {
    if (isHidden(element)) return;
    const role = roleOf(element);
    if (SKIPPED_ROLES.has(role) && element !== root) return;
    const tag = element.localName;
    if (role === "heading") {
      const value = text(element);
      if (value) blocks.push(`${"#".repeat(headingLevel(element))} ${value}`);
      return;
    }
    if (tag === "pre") {
      blocks.push(`\`\`\`\n${(element as HTMLElement).innerText}\n\`\`\``);
      return;
    }
    if (tag === "table") {
      const rows = Array.from((element as HTMLTableElement).rows)
        .filter((row) => !isHidden(row))
        .map(
          (row) =>
            `| ${Array.from(row.cells)
              .map((cell) =>
                text(cell).replace(/\n/g, " ").replace(/\|/g, "\\|"),
              )
              .join(" | ")} |`,
        );
      if (rows.length) {
        const columns = (rows[0].match(/ \| /g)?.length || 0) + 1;
        rows.splice(1, 0, `|${" --- |".repeat(columns)}`);
        blocks.push(rows.join("\n"));
      }
      return;
    }
    if (tag === "ul" || tag === "ol") {
      let index = 0;
      for (const child of children(element)) {
        if (!(child instanceof Element) || isHidden(child)) continue;
        index++;
        walk(child, `${prefix}${tag === "ol" ? `${index}.` : "-"} `);
      }
      return;
    }
    const childElements = children(element);
    const blockChildren = childElements.some(
      (child) => child instanceof Element && !isHidden(child) && isBlock(child),
    );
    if (!blockChildren) {
      const value = text(element);
      if (value) {
        const quote = tag === "blockquote" ? "> " : "";
        blocks.push(`${prefix}${quote}${value.replace(/\n/g, `\n${quote}`)}`);
      }
      return;
    }
    let run: Node[] = [];
    const flush = () => {
      const value = run.map(inline).join("").trim();
      if (compact(value)) blocks.push(`${prefix}${compact(value)}`);
      run = [];
    };
    for (const child of childElements) {
      if (child instanceof Element && !isHidden(child) && isBlock(child)) {
        flush();
        walk(child, prefix);
        prefix = prefix ? " ".repeat(prefix.length) : "";
      } else run.push(child);
    }
    flush();
  };

  walk(root);
  return blocks.join("\n\n");
}
