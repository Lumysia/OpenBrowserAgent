import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Chromium on Linux injects the OS UI font into extension pages, and picks
// CJK glyphs from whatever font fontconfig ranks first, so screenshots get a
// generated fontconfig file: Inter for Latin text and the regional CJK font
// for the locale, so Japanese or Traditional Chinese never render with
// Simplified Chinese glyph forms.
const UI_FONTS = ["Inter"];
const CJK_FONTS = {
  "ja-JP": { lang: "ja", families: ["Noto Sans CJK JP", "Noto Sans JP"] },
  ko: { lang: "ko", families: ["Noto Sans CJK KR", "Noto Sans KR"] },
  "zh-CN": { lang: "zh-cn", families: ["Noto Sans CJK SC", "Noto Sans SC"] },
  "zh-TW": { lang: "zh-tw", families: ["Noto Sans CJK TC", "Noto Sans TC"] },
};

function fc(command, ...args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "";
}

// The installed family among `families`, if any.
function installed(families) {
  return families.find((family) =>
    fc("fc-match", "-f", "%{family}", family)
      .split(",")
      .some((name) => name.toLowerCase() === family.toLowerCase()),
  );
}

function cjkFamily(locale) {
  const font = CJK_FONTS[locale];
  if (!font) return undefined;
  const family =
    installed(font.families) ||
    (fc("fc-list", `:lang=${font.lang}`, "family") &&
      fc("fc-match", "-f", "%{family[0]}", `sans-serif:lang=${font.lang}`));
  if (!family)
    throw new Error(
      `No font for ${locale} text. Install Noto Sans CJK (for example the fonts-noto-cjk package) and try again.`,
    );
  return family;
}

const alias = (family, prefer) =>
  `  <alias binding="strong"><family>${family}</family><prefer>${prefer
    .map((name) => `<family>${name}</family>`)
    .join("")}</prefer></alias>`;

// Points FONTCONFIG_FILE at a generated config for `locale` and returns a
// cleanup function. Does nothing outside Linux, where Chromium uses the
// system's own font fallback.
export async function useFonts(locale) {
  if (process.platform !== "linux") return async () => {};
  if (spawnSync("fc-match", ["--version"]).status !== 0)
    throw new Error("fontconfig (fc-match) is required on Linux.");
  const prefer = [installed(UI_FONTS), cjkFamily(locale)].filter(Boolean);
  const previous = process.env.FONTCONFIG_FILE;
  // The generated file extends the configuration fontconfig would load anyway.
  const base = previous || "/etc/fonts/fonts.conf";
  const dir = await mkdtemp(join(tmpdir(), "store-screenshots-fonts-"));
  const file = join(dir, "fonts.conf");
  await writeFile(
    file,
    [
      '<?xml version="1.0"?>',
      '<!DOCTYPE fontconfig SYSTEM "fonts.dtd">',
      "<fontconfig>",
      `  <include ignore_missing="yes">${base}</include>`,
      ...(prefer.length
        ? ["sans-serif", "system-ui"].map((family) => alias(family, prefer))
        : []),
      "</fontconfig>",
      "",
    ].join("\n"),
  );
  process.env.FONTCONFIG_FILE = file;
  return async () => {
    if (previous === undefined) delete process.env.FONTCONFIG_FILE;
    else process.env.FONTCONFIG_FILE = previous;
    await rm(dir, { recursive: true, force: true });
  };
}
