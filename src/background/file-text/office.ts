import JSZip from "jszip";

// Text of Office Open XML (docx, xlsx, pptx) and OpenDocument (odt, ods,
// odp) files: zip archives of XML. Paragraphs become lines, table rows and
// sheet rows become "a | b | c" lines.

export async function officeText(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes);
  const read = (path: string) => zip.file(path)?.async("string");
  const document = await read("word/document.xml");
  if (document) return wordText(document);
  if (zip.file("xl/workbook.xml")) return sheetText(zip, read);
  const slides = Object.keys(zip.files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort((a, b) => slideNumber(a) - slideNumber(b));
  if (slides.length) {
    const texts: string[] = [];
    for (const path of slides)
      texts.push(
        `## Slide ${slideNumber(path)}\n${paragraphs(
          (await read(path)) || "",
          "a:p",
          "a:t",
        )}`,
      );
    return texts.join("\n\n");
  }
  const content = await read("content.xml");
  if (content) return openDocumentText(content);
  return undefined;
}

const slideNumber = (path: string) => Number(path.match(/(\d+)\.xml$/)?.[1]);

function decode(text: string) {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(x?)([0-9a-f]+);/gi, (_, hex, code) =>
      String.fromCodePoint(parseInt(code, hex ? 16 : 10)),
    )
    .replace(/&amp;/g, "&");
}

// The text runs (`run` elements) of each paragraph element, one per line.
function paragraphs(xml: string, paragraph: string, run: string) {
  const runs = new RegExp(`<${run}(?:\\s[^>]*)?>([\\s\\S]*?)</${run}>`, "g");
  return [
    ...xml.matchAll(
      new RegExp(`<${paragraph}[\\s>][\\s\\S]*?</${paragraph}>`, "g"),
    ),
  ]
    .map(([block]) =>
      [...block.replace(/<w:tab\/>/g, "<w:t>\t</w:t>").matchAll(runs)]
        .map((match) => decode(match[1]))
        .join(""),
    )
    .filter((line) => line.trim())
    .join("\n");
}

function wordText(xml: string) {
  const body = xml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, (table) =>
    [...table.matchAll(/<w:tr[\s>][\s\S]*?<\/w:tr>/g)]
      .map(([row]) =>
        [...row.matchAll(/<w:tc[\s>][\s\S]*?<\/w:tc>/g)]
          .map(([cell]) => paragraphs(cell, "w:p", "w:t").replace(/\n/g, " "))
          .join(" | "),
      )
      .map((line) => `<w:p><w:t>${line.replace(/</g, "&lt;")}</w:t></w:p>`)
      .join(""),
  );
  return paragraphs(body, "w:p", "w:t");
}

async function sheetText(
  zip: JSZip,
  read: (path: string) => Promise<string> | undefined,
) {
  const strings = [
    ...((await read("xl/sharedStrings.xml")) || "").matchAll(
      /<si>([\s\S]*?)<\/si>/g,
    ),
  ].map(([, item]) =>
    [...item.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
      .map((match) => decode(match[1]))
      .join(""),
  );
  const workbook = (await read("xl/workbook.xml")) || "";
  const rels = (await read("xl/_rels/workbook.xml.rels")) || "";
  const targets = new Map(
    [...rels.matchAll(/<Relationship\s[^>]*>/g)].map(([tag]) => [
      tag.match(/Id="([^"]+)"/)?.[1],
      tag.match(/Target="([^"]+)"/)?.[1],
    ]),
  );
  const texts: string[] = [];
  for (const [tag] of workbook.matchAll(/<sheet\s[^>]*>/g)) {
    const name = decode(tag.match(/name="([^"]*)"/)?.[1] || "");
    const target = targets.get(tag.match(/r:id="([^"]+)"/)?.[1]) || "";
    const path = target.startsWith("/")
      ? target.slice(1)
      : `xl/${target.replace(/^\.\//, "")}`;
    const sheet = (await zip.file(path)?.async("string")) || "";
    const rows = [...sheet.matchAll(/<row[\s>][\s\S]*?<\/row>/g)].map(([row]) =>
      [...row.matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)]
        .map(([, attributes, inner = ""]) => {
          const type = attributes.match(/t="(\w+)"/)?.[1];
          const value = decode(inner.match(/<v>([\s\S]*?)<\/v>/)?.[1] || "");
          if (type === "s") return strings[Number(value)] ?? "";
          if (type === "inlineStr")
            return decode(inner.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] || "");
          if (type === "b") return value === "1" ? "TRUE" : "FALSE";
          return value;
        })
        .join(" | "),
    );
    texts.push(
      `## Sheet ${name}\n${rows.filter((row) => row.replace(/[|\s]/g, "")).join("\n")}`,
    );
  }
  return texts.join("\n\n");
}

function openDocumentText(xml: string) {
  const body = xml
    .replace(
      /<table:table-row[\s>][\s\S]*?<\/table:table-row>/g,
      (row) =>
        `<text:p>${[
          ...row.matchAll(/<table:table-cell[\s\S]*?<\/table:table-cell>/g),
        ]
          .map(([cell]) => decode(cell.replace(/<\/text:p>/g, " ")).trim())
          .join(" | ")
          .replace(/</g, "&lt;")}</text:p>`,
    )
    .replace(/<text:(tab|s)\/>/g, " ")
    .replace(/<text:line-break\/>/g, "\n");
  return [...body.matchAll(/<text:(p|h)[\s>][\s\S]*?<\/text:\1>/g)]
    .map(([block]) => decode(block))
    .filter((line) => line.trim())
    .join("\n");
}
