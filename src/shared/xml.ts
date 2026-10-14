// Tagged blocks for prompts. Values are escaped so page text cannot close a
// tag early.
function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function xmlTag(name: string, value: string | number) {
  return `<${name}>${escapeXml(String(value))}</${name}>`;
}

export function xmlBlock(name: string, lines: Array<string | undefined>) {
  return [`<${name}>`, ...lines.filter(Boolean), `</${name}>`].join("\n");
}
