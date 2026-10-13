import {
  alpha,
  contrast,
  ensureContrast,
  fromOklch,
  mix,
  toOklch,
} from "./color";
import {
  normalizeTheme,
  THEMES,
  type ResolvedScheme,
  type ThemeDefinition,
} from "./themes";

// Every color the UI uses, as CSS custom properties (without the `--`).
export type ThemeTokens = Record<(typeof TOKEN_NAMES)[number], string>;

export const TOKEN_NAMES = [
  "background",
  "foreground",
  "card",
  "popover",
  "secondary",
  "muted",
  "muted-foreground",
  "border",
  "input",
  "accent-strong",
  "accent-text",
  "accent-solid",
  "accent-soft",
  "accent-softer",
  "accent-hover",
  "accent-active",
  "accent-shadow",
  "ring",
  "bubble",
  "bubble-2",
  "wash-1",
  "wash-2",
  "wash-3",
  "destructive",
  "destructive-solid",
  "destructive-foreground",
  "warning",
  "shadow-contact",
  "shadow-ambient",
  "edge",
  "code-keyword",
  "code-string",
  "code-number",
] as const;

// The neutral palette both schemes start from (warm greys).
const NEUTRALS: Record<
  ResolvedScheme,
  Record<
    | "background"
    | "foreground"
    | "card"
    | "popover"
    | "secondary"
    | "muted"
    | "muted-foreground"
    | "border"
    | "input",
    string
  >
> = {
  light: {
    background: "#fafafa",
    foreground: "#161512",
    card: "#ffffff",
    popover: "#ffffff",
    secondary: "#f5f5f5",
    muted: "#f6f6f6",
    "muted-foreground": "#706d65",
    border: "#e4e4e4",
    input: "#e4e4e4",
  },
  dark: {
    background: "#171612",
    foreground: "#eee9df",
    card: "#211f1a",
    popover: "#24221d",
    secondary: "#2b2923",
    muted: "#25231e",
    "muted-foreground": "#aaa397",
    border: "#39362d",
    input: "#403c32",
  },
};

// Lightness and relative chroma of each derived role, per scheme. Tuned so
// the classic accents keep the look of 0.1.0.
const ROLE = {
  light: {
    strong: [0.56, 1],
    solid: [0.63, 1.05],
    soft: [0.932, 0.3],
    softer: [0.966, 0.15],
    hover: [0.908, 0.36],
    active: [0.877, 0.44],
    bubble: [0.918, 0.36],
    wash: [0.962, 0.2],
  },
  dark: {
    strong: [0.79, 0.85],
    solid: [0.69, 0.9],
    soft: [0.34, 0.48],
    softer: [0.252, 0.28],
    hover: [0.31, 0.4],
    active: [0.38, 0.58],
    bubble: [0.34, 0.5],
    wash: [0.255, 0.24],
  },
} as const;

// Chroma caps keep loud flag colors pleasant as large areas.
const MAX_CHROMA = { strong: 0.15, tint: 0.055 } as const;

function role(
  seed: string | null,
  [lightness, chroma]: readonly [number, number],
  cap: number = MAX_CHROMA.tint,
) {
  if (!seed) return fromOklch({ l: lightness, c: 0, h: 0 });
  const { c, h } = toOklch(seed);
  return fromOklch({ l: lightness, c: Math.min(c * chroma, cap), h });
}

function ensureAll(color: string, backgrounds: string[], ratio = 4.5) {
  let result = color;
  // Each pass can only move further from the backgrounds, so this settles.
  for (let pass = 0; pass < 4; pass++)
    for (const background of backgrounds)
      result = ensureContrast(result, background, ratio);
  return result;
}

function tinted(neutral: string, hue: string | undefined, amount: number) {
  if (!hue) return neutral;
  const { l } = toOklch(neutral);
  return mix(fromOklch({ l, c: 0.03, h: toOklch(hue).h }), neutral, amount);
}

export function themeTokens(
  themeId: unknown,
  scheme: ResolvedScheme,
): ThemeTokens {
  const theme: ThemeDefinition = THEMES[normalizeTheme(themeId)];
  const dark = scheme === "dark";
  const roles = ROLE[scheme];
  const surface = theme.surface ?? theme.primary;
  const [bubbleFrom, bubbleTo] = theme.bubble ?? [surface, surface];
  const wash = theme.wash ?? [surface, surface, surface];
  const neutrals = Object.fromEntries(
    Object.entries(NEUTRALS[scheme]).map(([name, value]) => [
      name,
      name.endsWith("foreground")
        ? value
        : tinted(value, theme.tint, dark ? 0.32 : 0.22),
    ]),
  ) as (typeof NEUTRALS)[ResolvedScheme];

  const soft = role(surface, roles.soft);
  const softer = role(surface, roles.softer);
  const hover = role(surface, roles.hover);
  const active = role(surface, roles.active);
  const bubble = role(bubbleFrom, roles.bubble);
  const bubble2 = role(bubbleTo, roles.bubble);
  const washes = wash.map((seed) =>
    seed
      ? role(seed, roles.wash)
      : mix(neutrals.background, neutrals.card, 0.5),
  );
  const pageBackgrounds = [
    neutrals.background,
    neutrals.card,
    neutrals.popover,
    neutrals.secondary,
    ...washes,
  ];
  const accentSurfaces = [soft, softer, hover, active, bubble, bubble2];

  const strong = ensureAll(
    role(theme.primary, roles.strong, MAX_CHROMA.strong),
    [...pageBackgrounds, softer, soft],
  );
  const accentText = ensureAll(mix(strong, neutrals.foreground, 0.8), [
    ...pageBackgrounds,
    ...accentSurfaces,
  ]);
  const solid = role(theme.primary, roles.solid, MAX_CHROMA.strong);
  const destructiveSolid = dark ? "#b8372f" : "#b3261e";
  return {
    ...neutrals,
    "muted-foreground": ensureAll(
      neutrals["muted-foreground"],
      pageBackgrounds,
    ),
    "accent-strong": strong,
    "accent-text": accentText,
    "accent-solid": solid,
    "accent-soft": soft,
    "accent-softer": softer,
    "accent-hover": hover,
    "accent-active": active,
    "accent-shadow": alpha(strong, 0.18),
    ring: alpha(strong, dark ? 0.34 : 0.42),
    bubble,
    "bubble-2": bubble2,
    "wash-1": washes[0],
    "wash-2": washes[1],
    "wash-3": washes[2],
    destructive: ensureAll(dark ? "#f08a80" : "#b3261e", pageBackgrounds),
    "destructive-solid": destructiveSolid,
    "destructive-foreground": "#ffffff",
    warning: ensureAll(dark ? "#e0a43a" : "#9a6514", pageBackgrounds),
    "shadow-contact": dark ? "rgb(0 0 0 / 34%)" : "rgb(22 21 18 / 7%)",
    "shadow-ambient": dark
      ? "rgb(0 0 0 / 42%)"
      : alpha(mix(strong, "#161512", 0.12), 0.1),
    edge: dark ? "rgb(255 255 255 / 7%)" : "rgb(255 255 255 / 0%)",
    "code-keyword": ensureAll(dark ? "#c7a8ff" : "#8b5fbf", pageBackgrounds),
    "code-string": ensureAll(dark ? "#e5c07b" : "#80601a", pageBackgrounds),
    "code-number": ensureAll(dark ? "#ef9f76" : "#9a5a36", pageBackgrounds),
  };
}

// Text and the backgrounds it is drawn on, for the contrast test: each pair
// must read at 4.5:1 or more in every theme and scheme.
export function textPairs(tokens: ThemeTokens) {
  const page = [
    "background",
    "card",
    "popover",
    "secondary",
    "wash-1",
    "wash-2",
    "wash-3",
  ] as const;
  const accent = [
    "accent-soft",
    "accent-softer",
    "accent-hover",
    "accent-active",
    "bubble",
    "bubble-2",
  ] as const;
  const pairs: [string, string][] = [];
  for (const background of [...page, ...accent]) {
    pairs.push(["foreground", background], ["accent-text", background]);
  }
  for (const background of page)
    pairs.push(
      ["muted-foreground", background],
      ["accent-strong", background],
      ["destructive", background],
      ["warning", background],
    );
  pairs.push(
    ["accent-strong", "accent-soft"],
    ["accent-strong", "accent-softer"],
    ["destructive-foreground", "destructive-solid"],
  );
  return pairs.map(([text, background]) => ({
    text,
    background,
    ratio: contrast(
      tokens[text as keyof ThemeTokens],
      tokens[background as keyof ThemeTokens],
    ),
  }));
}
