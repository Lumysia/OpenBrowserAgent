// Checks the free translation engines against the live services: the
// paragraphs of a real page go through each endpoint, and the script reports
// whether every paragraph came back with its links and code in place. Not
// part of the test suite (it uses the network and the services' goodwill);
// run it when an engine seems broken:
//
//   npm run test:page-translate:live -- [url] [language]
import { parseHTML } from "linkedom";
import {
  fromGoogleHtml,
  toGoogleHtml,
  translateFallback,
  translateHtml,
} from "../src/background/page-translate/engines/google";
import { microsoftEngine } from "../src/background/page-translate/engines/microsoft";
import { walkParagraphs, type Paragraph } from "../src/page-translate/blocks";
import { parsePlaceholders } from "../src/shared/page-translate/placeholders";

const [url = "https://en.wikipedia.org/wiki/Hiking", target = "de"] =
  process.argv.slice(2);
const PARAGRAPHS = 12;

const html = await (await fetch(url)).text();
const { document } = parseHTML(html);
const items = [...walkParagraphs(document.body)]
  .filter(
    (paragraph): paragraph is Paragraph =>
      !!paragraph && paragraph.source.plain.length > 80,
  )
  .slice(0, PARAGRAPHS)
  .map((paragraph, index) => ({ id: index + 1, text: paragraph.source.text }));
console.log(`${url}: ${items.length} paragraphs into ${target}`);

const signal = new AbortController().signal;
const engines: Array<[string, () => Promise<string[]>]> = [
  [
    "Google translateHtml",
    async () =>
      (
        await translateHtml(
          items.map((item) => toGoogleHtml(item.text)),
          target,
          signal,
        )
      ).map(fromGoogleHtml),
  ],
  [
    "Google translate_a/t",
    async () =>
      (
        await translateFallback(
          items.map((item) => toGoogleHtml(item.text)),
          target,
          signal,
        )
      ).map(fromGoogleHtml),
  ],
  [
    "Microsoft translatetext",
    async () => {
      const results = new Map<number, string>();
      await microsoftEngine().translate({
        items,
        target,
        signal,
        onItem: (id, text) => results.set(id, text),
      });
      return items.map((item) => results.get(item.id) ?? "");
    },
  ],
];

let failed = false;
for (const [name, run] of engines) {
  const started = Date.now();
  try {
    const results = await run();
    const kept = results.filter(
      (text, index) => text && parsePlaceholders(items[index].text, text),
    ).length;
    const markers = items.filter((item) => /<b\d+>|\{\d+\}/.test(item.text));
    console.log(
      `${name}: ${results.filter(Boolean).length}/${items.length} translated, ` +
        `${kept}/${items.length} with every marker in place ` +
        `(${markers.length} had markers), ${Date.now() - started} ms`,
    );
    console.log(`  e.g. ${results[0]?.slice(0, 160)}`);
  } catch (error) {
    failed = true;
    console.log(
      `${name}: FAILED ${error instanceof Error ? `${error.name} ${error.message}` : error}`,
    );
  }
}
process.exit(failed ? 1 : 0);
