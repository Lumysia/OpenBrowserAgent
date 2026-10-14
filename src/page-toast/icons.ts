// Lucide's circle-check and circle-alert, the icon set of the side panel and
// the smart bar, as plain SVG: page notes render without React (importing
// lucide-react would bring React into every page script that shows one).
type IconNode = [tag: string, attributes: Record<string, string>][];

export const PAGE_TOAST_ICONS: Record<"info" | "error", IconNode> = {
  info: [
    ["circle", { cx: "12", cy: "12", r: "10" }],
    ["path", { d: "m9 12 2 2 4-4" }],
  ],
  error: [
    ["circle", { cx: "12", cy: "12", r: "10" }],
    ["line", { x1: "12", x2: "12", y1: "8", y2: "12" }],
    ["line", { x1: "12", x2: "12.01", y1: "16", y2: "16" }],
  ],
};

const SVG = "http://www.w3.org/2000/svg";
const SVG_ATTRIBUTES = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  "stroke-width": "2",
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
  "aria-hidden": "true",
};

export function iconSvg(node: IconNode) {
  const svg = document.createElementNS(SVG, "svg");
  for (const [name, value] of Object.entries(SVG_ATTRIBUTES))
    svg.setAttribute(name, value);
  for (const [tag, attributes] of node) {
    const element = document.createElementNS(SVG, tag);
    for (const [name, value] of Object.entries(attributes))
      element.setAttribute(name, value);
    svg.append(element);
  }
  return svg;
}
