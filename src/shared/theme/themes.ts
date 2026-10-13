// The color themes users pick in General settings. Each theme is a few seed
// colors; tokens.ts derives every color the UI uses from them, for light and
// dark. Stored in `Preferences.accentColor`: ids are stored data, keep them.

export const COLOR_SCHEMES = ["system", "light", "dark"] as const;
export type ColorScheme = (typeof COLOR_SCHEMES)[number];
export type ResolvedScheme = Exclude<ColorScheme, "system">;
export const DEFAULT_COLOR_SCHEME: ColorScheme = "system";

export const ACCENT_THEMES = [
  "pink",
  "green",
  "blue",
  "purple",
  "amber",
] as const;
export const PRIDE_THEMES = [
  "rainbow",
  "trans",
  "lesbian",
  "bi",
  "pan",
  "nonbinary",
  "ace",
] as const;
export type AccentTheme = (typeof ACCENT_THEMES)[number];
export type PrideTheme = (typeof PRIDE_THEMES)[number];
export type ThemeId = AccentTheme | PrideTheme;
export const DEFAULT_THEME: ThemeId = "pink";

export type ThemeDefinition = {
  // The accent family: text, icons, links, controls, focus rings and the
  // soft fills behind them (selected rows, hovers, chips, pills). One hue,
  // so a label and the fill it sits on always belong together. Pick it from
  // the page colors (wash, tint) of the same scheme so accents never fight
  // the surface they sit on.
  accent: string;
  // The user's message bubble and the send button, as a gradient.
  // Default: the accent hue.
  bubble?: [string, string];
  // The page wash from top to bottom (side panel, settings). `null` is a
  // white stripe. Default: the accent hue.
  wash?: [string | null, string | null, string | null];
  // A hue the neutral surfaces lean towards; none keeps them warm grey.
  tint?: string;
  // Stripes for the settings swatch, top to bottom.
  flag?: string[];
  // Seeds for dark backgrounds, where some hues (yellows) turn muddy as
  // large areas and the accent has to follow the page it sits on.
  dark?: Partial<Pick<ThemeDefinition, "accent" | "bubble" | "wash">>;
};

export const THEMES: Record<ThemeId, ThemeDefinition> = {
  pink: { accent: "#a35b76" },
  green: { accent: "#6f7f24" },
  blue: { accent: "#3b6f91" },
  purple: { accent: "#7565a6" },
  amber: { accent: "#9a7028" },
  // Six stripes spread over the roles: the page washes run through the
  // flag, the bubble and the accents stay warm like the top of the page.
  rainbow: {
    accent: "#e40303",
    bubble: ["#ff8c00", "#e40303"],
    wash: ["#e40303", "#ffed00", "#008026"],
    flag: ["#e40303", "#ff8c00", "#ffed00", "#008026", "#004cff", "#732982"],
    dark: { wash: ["#e40303", "#732982", "#004cff"] },
  },
  // Soft blue surfaces and accents, the bubble runs blue to pink, white
  // between the washes.
  trans: {
    accent: "#5bcefa",
    bubble: ["#5bcefa", "#f5a9b8"],
    wash: ["#5bcefa", "#f5a9b8", "#5bcefa"],
    tint: "#5bcefa",
    flag: ["#5bcefa", "#f5a9b8", "#ffffff", "#f5a9b8", "#5bcefa"],
  },
  // The orange to pink range: orange accents on peach, a bubble to pink.
  lesbian: {
    accent: "#ff9a56",
    bubble: ["#ff9a56", "#d362a4"],
    wash: ["#d52d00", null, "#d362a4"],
    tint: "#ef7627",
    flag: ["#d52d00", "#ff9a56", "#ffffff", "#d362a4", "#a30262"],
  },
  bi: {
    accent: "#9b4f96",
    bubble: ["#d60270", "#9b4f96"],
    wash: ["#d60270", "#9b4f96", "#0038a8"],
    tint: "#9b4f96",
    flag: ["#d60270", "#d60270", "#9b4f96", "#0038a8", "#0038a8"],
  },
  // Pink accents with the warm top of the page; yellow and blue live in
  // the bubble and the wash. In dark the yellow wash reads as olive, so
  // the accents turn gold to match it.
  pan: {
    accent: "#ff218c",
    bubble: ["#ffd800", "#ff218c"],
    wash: ["#ff218c", "#ffd800", "#21b1ff"],
    flag: ["#ff218c", "#ffd800", "#21b1ff"],
    dark: { accent: "#ffd800" },
  },
  nonbinary: {
    accent: "#9c59d1",
    bubble: ["#fcf434", "#9c59d1"],
    wash: ["#fcf434", null, "#9c59d1"],
    tint: "#9c59d1",
    flag: ["#fcf434", "#ffffff", "#9c59d1", "#2c2c2c"],
    dark: { wash: ["#9c59d1", null, "#fcf434"] },
  },
  // Muted purple on cool greys, black to white in the wash.
  ace: {
    accent: "#76508a",
    bubble: ["#a3a3a3", "#800080"],
    wash: ["#a3a3a3", null, "#800080"],
    tint: "#800080",
    flag: ["#000000", "#a3a3a3", "#ffffff", "#800080"],
  },
};

const THEME_IDS = new Set<string>([...ACCENT_THEMES, ...PRIDE_THEMES]);

// Stored values from other versions (or edited by hand) fall back to the
// default; the stored value itself stays as it is.
export function normalizeTheme(value: unknown): ThemeId {
  return typeof value === "string" && THEME_IDS.has(value)
    ? (value as ThemeId)
    : DEFAULT_THEME;
}

export function normalizeColorScheme(value: unknown): ColorScheme {
  return (COLOR_SCHEMES as readonly unknown[]).includes(value)
    ? (value as ColorScheme)
    : DEFAULT_COLOR_SCHEME;
}

export function isPrideTheme(id: ThemeId): id is PrideTheme {
  return (PRIDE_THEMES as readonly string[]).includes(id);
}
