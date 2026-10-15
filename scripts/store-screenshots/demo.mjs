import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

// Relative to the repository root, the working directory.
const demoPath = (...parts) => resolve("store/demo", ...parts);

export const DEMO_URLS = {
  article: "https://tidewater-eng.blog/2026/incremental-search-index",
  booking: "https://saltmarsh-kitchen.com/reserve",
};

export async function demoLocales() {
  return (await readdir(demoPath("strings")))
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.slice(0, -".json".length))
    .sort();
}

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

// Fills `{name}` placeholders from `values`.
export const fill = (text, values) =>
  text.replace(/\{(\w+)\}/g, (match, key) => values[key] ?? match);

// The booking page offers the next Thursday to Sunday, and the agent books
// the Friday, all formatted the way the locale writes dates and times.
function bookingSlots(locale) {
  const friday = new Date();
  friday.setHours(12, 0, 0, 0);
  friday.setDate(friday.getDate() + (((5 - friday.getDay() + 6) % 7) + 1));
  const dateFormat = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const timeFormat = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
  });
  const dates = [-1, 0, 1, 2].map((offset) => {
    const date = new Date(friday);
    date.setDate(friday.getDate() + offset);
    return dateFormat.format(date);
  });
  const times = [0, 30, 60, 90, 120, 150].map((minutes) =>
    timeFormat.format(new Date(2026, 0, 1, 18, minutes)),
  );
  return { dates, times };
}

// Everything a locale's shots show: page texts, prompts and scripted answers.
export async function loadDemo(locale) {
  const strings = JSON.parse(
    await readFile(demoPath("strings", `${locale}.json`), "utf8"),
  );
  const { dates, times } = bookingSlots(locale);
  const booking = { ...strings.booking, dates, times };
  const guest = strings.agent;
  const pick = {
    date: dates[1],
    time: times[3],
    party: booking.partyOptions[1],
    name: guest.name,
    email: guest.email,
  };
  return {
    locale,
    lang: locale,
    article: strings.article,
    booking,
    ask: strings.ask,
    agent: {
      ...guest,
      pick,
      prompt: fill(guest.prompt, pick),
      answer: fill(guest.answer, pick),
    },
    providers: strings.providers,
  };
}

const lookup = (data, path) =>
  path.split(".").reduce((value, key) => value?.[key], data);

// Renders `store/demo/<page>.html`: `{{path}}` is replaced with the escaped
// string at that path, and `code` spans become <code>.
export async function renderPage(page, demo) {
  const template = await readFile(demoPath(`${page}.html`), "utf8");
  return template.replace(/\{\{([\w.]+)\}\}/g, (match, path) => {
    const value = lookup(demo, path);
    if (value === undefined) throw new Error(`Missing demo string ${path}`);
    return escapeHtml(value).replace(/`([^`]+)`/g, "<code>$1</code>");
  });
}
