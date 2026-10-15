import type { MermaidConfig } from "mermaid";
import { MERMAID_RENDER_CACHE_SIZE } from "../../src/shared/config";

// Mermaid diagrams are drawn here, by the bundled package, loaded the first
// time a diagram is shown. Nothing is sent anywhere.
//
// Safety: Mermaid runs with securityLevel "strict" (labels are sanitized, no
// click handlers or scripts), and a diagram's own directives cannot change
// the theme, its CSS or the label mode. The result is shown as an <img>, so
// even a crafted SVG cannot run script or load anything: images are drawn
// without scripts and without fetching other resources.

export type MermaidDiagram = {
  svg: string;
  width: number;
  height: number;
};

// Keys a diagram's directives (%%{init: …}%%) may not change.
const LOCKED_KEYS = [
  "theme",
  "themeVariables",
  "themeCSS",
  "fontFamily",
  "altFontFamily",
  "htmlLabels",
  "darkMode",
];

type Mermaid = (typeof import("mermaid"))["default"];
let mermaid: Promise<Mermaid> | undefined;
// Mermaid holds one global config, so diagrams render one at a time.
let queue: Promise<unknown> = Promise.resolve();
let nextId = 0;
const rendered = new Map<
  string,
  { drawing: Promise<MermaidDiagram>; diagram?: MermaidDiagram }
>();

function loadMermaid() {
  mermaid ??= import("mermaid").then((module) => module.default);
  return mermaid;
}

// The same diagram in the same theme is drawn once.
export function renderMermaid(code: string, theme: string) {
  const key = `${theme}\n${code}`;
  const cached = rendered.get(key);
  if (cached) return cached.drawing;
  const drawing = queue.catch(() => undefined).then(() => draw(code));
  queue = drawing;
  const entry: { drawing: Promise<MermaidDiagram>; diagram?: MermaidDiagram } =
    { drawing };
  drawing.then((diagram) => (entry.diagram = diagram)).catch(() => undefined);
  rendered.set(key, entry);
  if (rendered.size > MERMAID_RENDER_CACHE_SIZE)
    rendered.delete(rendered.keys().next().value!);
  return drawing;
}

// A diagram already drawn, so a slot made again shows it at once.
export function drawnMermaid(code: string, theme: string) {
  return rendered.get(`${theme}\n${code}`)?.diagram;
}

async function draw(code: string): Promise<MermaidDiagram> {
  const api = await loadMermaid();
  api.initialize(mermaidConfig(api));
  const { svg } = await api.render(`mermaid-diagram-${++nextId}`, code);
  return sizedSvg(svg);
}

function mermaidConfig(api: Mermaid): MermaidConfig {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string) => style.getPropertyValue(`--${name}`).trim();
  const background = token("card");
  const text = token("foreground");
  const accentStrong = token("accent-strong");
  const fontFamily = token("font-sans");
  const defaults = api.mermaidAPI.getSiteConfig().secure ?? [];
  return {
    startOnLoad: false,
    securityLevel: "strict",
    // SVG text instead of HTML in <foreignObject>: it draws the same in an
    // <img> and on a canvas (for PNG export).
    htmlLabels: false,
    suppressErrorRendering: true,
    secure: [...new Set([...defaults, ...LOCKED_KEYS])],
    theme: "base",
    fontFamily,
    darkMode: document.documentElement.dataset.scheme === "dark",
    themeVariables: {
      fontFamily,
      background,
      mainBkg: background,
      primaryColor: token("accent-soft"),
      primaryTextColor: text,
      primaryBorderColor: accentStrong,
      secondaryColor: token("secondary"),
      tertiaryColor: token("accent-softer"),
      lineColor: token("muted-foreground"),
      textColor: text,
      nodeBorder: accentStrong,
      clusterBkg: background,
      clusterBorder: token("border"),
      edgeLabelBackground: background,
    },
  };
}

// Mermaid writes its SVG as HTML markup sized to the page (width 100%). As
// an image it must be well-formed XML with its own size, from the viewBox.
function sizedSvg(source: string): MermaidDiagram {
  const root = new DOMParser()
    .parseFromString(source, "text/html")
    .querySelector("svg");
  const [, , width = 0, height = 0] = (root?.getAttribute("viewBox") || "")
    .split(/[\s,]+/)
    .map(Number);
  if (!root || !(width > 0 && height > 0)) throw new Error("Empty diagram");
  root.setAttribute("width", String(width));
  root.setAttribute("height", String(height));
  root.removeAttribute("style");
  return {
    svg: new XMLSerializer().serializeToString(root),
    width,
    height,
  };
}

export function svgDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// The diagram as a PNG at `scale` times its size, drawn from the same image.
export async function mermaidPng(diagram: MermaidDiagram, scale: number) {
  const image = new Image();
  image.src = svgDataUrl(diagram.svg);
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(diagram.width * scale);
  canvas.height = Math.ceil(diagram.height * scale);
  canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("No PNG"))),
      "image/png",
    ),
  );
}
