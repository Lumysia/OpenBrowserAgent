// Chrome Web Store screenshots for every UI language, made by the real
// extension with seeded settings and scripted provider answers.
//
//   npm run build:chrome
//   node scripts/store-screenshots.mjs [--locale en-US,de] [--out store/screenshots]
import { existsSync } from "node:fs";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { FRAME, pngHeader } from "./store-screenshots/browser.mjs";
import { agentShot, askShot } from "./store-screenshots/chat-shots.mjs";
import { demoLocales, loadDemo } from "./store-screenshots/demo.mjs";
import { optionsShots } from "./store-screenshots/options-shots.mjs";
import { translateShot } from "./store-screenshots/translate-shot.mjs";

// Paths below are relative to the repository root.
process.chdir(resolve(dirname(fileURLToPath(import.meta.url)), ".."));

let options;
try {
  ({ values: options } = parseArgs({
    options: {
      locale: { type: "string" },
      out: { type: "string", default: "store/screenshots" },
    },
  }));
} catch (error) {
  console.error(error.message);
  console.error(
    "Usage: node scripts/store-screenshots.mjs [--locale en-US,de] [--out store/screenshots]",
  );
  process.exit(1);
}

if (!existsSync(".output/chrome-mv3/manifest.json")) {
  console.error(
    "No extension build in .output/chrome-mv3. Run `npm run build:chrome` first.",
  );
  process.exit(1);
}

// Locale ids are the ones under src/shared/locales; a prefix such as `de`
// or `zh` selects every matching id.
const available = await demoLocales();
const requested = options.locale?.split(",").map((item) => item.trim());
const locales = requested
  ? available.filter((locale) =>
      requested.some(
        (item) =>
          locale.toLowerCase() === item.toLowerCase() ||
          locale.toLowerCase().startsWith(`${item.toLowerCase()}-`),
      ),
    )
  : available;
const unknown = (requested || []).filter(
  (item) =>
    !locales.some(
      (locale) =>
        locale.toLowerCase() === item.toLowerCase() ||
        locale.toLowerCase().startsWith(`${item.toLowerCase()}-`),
    ),
);
if (unknown.length) {
  console.error(
    `Unknown locale ${unknown.join(", ")}. Available: ${available.join(", ")}.`,
  );
  process.exit(1);
}

// Store screenshots must be exactly 1280x800 without alpha (color type 2).
function checkPng(file, png) {
  const header = pngHeader(png);
  if (
    header.width !== FRAME.width ||
    header.height !== FRAME.height ||
    header.depth !== 8 ||
    header.colorType !== 2
  )
    throw new Error(
      `${file} is not a 1280x800 RGB PNG: ${JSON.stringify(header)}`,
    );
}

let warnings = 0;
for (const locale of locales) {
  const demo = await loadDemo(locale);
  const ask = await askShot(demo);
  const agent = await agentShot(demo);
  const translate = await translateShot(demo);
  const settings = await optionsShots(demo);
  const shots = [
    { name: "ask", ...ask },
    { name: "agent", ...agent },
    { name: "translate", ...translate },
    ...settings,
  ];
  const dir = resolve(options.out, locale);
  await mkdir(dir, { recursive: true });
  // Shots that were renamed or dropped don't stay behind.
  for (const file of await readdir(dir))
    if (/^screenshot-.*\.png$/.test(file)) await rm(resolve(dir, file));
  for (const [index, shot] of shots.entries()) {
    const file = resolve(dir, `screenshot-${index + 1}-${shot.name}.png`);
    checkPng(file, shot.png);
    await writeFile(file, shot.png);
    console.log(file);
    for (const warning of shot.warnings) {
      warnings++;
      console.warn(`  warning: ${warning}`);
    }
  }
}

if (warnings) {
  console.error(`${warnings} layout warning(s); review the screenshots above.`);
  process.exitCode = 1;
}
