// Small color toolkit for the theme table: sRGB hex <-> OKLCH, mixing and
// WCAG contrast. Everything works on plain hex strings so the results can go
// straight into CSS variables and tests.

export type Oklch = { l: number; c: number; h: number };
type Rgb = [number, number, number];

function parseHex(hex: string): Rgb {
  const value = hex.replace("#", "");
  const full =
    value.length === 3
      ? [...value].map((digit) => digit + digit).join("")
      : value;
  return [0, 2, 4].map((index) =>
    parseInt(full.slice(index, index + 2), 16),
  ) as Rgb;
}

function toLinear(channel: number) {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function fromLinear(value: number) {
  const encoded =
    value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, encoded)) * 255);
}

function linearToOklab([r, g, b]: Rgb): Rgb {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToLinear([L, a, b]: Rgb): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export function toOklch(hex: string): Oklch {
  const [L, a, b] = linearToOklab(parseHex(hex).map(toLinear) as Rgb);
  const h = (Math.atan2(b, a) * 180) / Math.PI;
  return { l: L, c: Math.hypot(a, b), h: h < 0 ? h + 360 : h };
}

function inGamut(rgb: Rgb) {
  return rgb.every((value) => value >= -0.0001 && value <= 1.0001);
}

// Out-of-gamut colors keep their lightness and hue and lose chroma until
// they fit, which keeps derived tints from turning muddy or neon.
export function fromOklch({ l, c, h }: Oklch): string {
  const angle = (h * Math.PI) / 180;
  const lightness = Math.min(1, Math.max(0, l));
  let chroma = Math.max(0, c);
  let rgb = oklabToLinear([
    lightness,
    chroma * Math.cos(angle),
    chroma * Math.sin(angle),
  ]);
  for (let step = 0; step < 24 && !inGamut(rgb); step++) {
    chroma *= 0.9;
    rgb = oklabToLinear([
      lightness,
      chroma * Math.cos(angle),
      chroma * Math.sin(angle),
    ]);
  }
  return `#${rgb
    .map((value) => fromLinear(value).toString(16).padStart(2, "0"))
    .join("")}`;
}

// Mixes in OKLab, like CSS `color-mix(in oklab, a weight%, b)`.
export function mix(a: string, b: string, weight: number): string {
  const first = linearToOklab(parseHex(a).map(toLinear) as Rgb);
  const second = linearToOklab(parseHex(b).map(toLinear) as Rgb);
  const mixed = first.map(
    (value, index) => value * weight + second[index] * (1 - weight),
  ) as Rgb;
  const { l, c, h } = (() => {
    const hue = (Math.atan2(mixed[2], mixed[1]) * 180) / Math.PI;
    return {
      l: mixed[0],
      c: Math.hypot(mixed[1], mixed[2]),
      h: hue < 0 ? hue + 360 : hue,
    };
  })();
  return fromOklch({ l, c, h });
}

export function alpha(hex: string, opacity: number) {
  const [r, g, b] = parseHex(hex);
  return `rgb(${r} ${g} ${b} / ${Math.round(opacity * 1000) / 10}%)`;
}

export function luminance(hex: string) {
  const [r, g, b] = parseHex(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

// Moves the color's lightness away from the background until the pair reads
// at `ratio`, keeping hue and as much chroma as fits.
export function ensureContrast(color: string, background: string, ratio = 4.5) {
  if (contrast(color, background) >= ratio) return color;
  const base = toOklch(color);
  const darker = luminance(background) > 0.18;
  for (let step = 1; step <= 100; step++) {
    const l = base.l + (darker ? -step : step) * 0.01;
    const candidate = fromOklch({ ...base, l });
    if (contrast(candidate, background) >= ratio) return candidate;
  }
  return darker ? "#000000" : "#ffffff";
}
