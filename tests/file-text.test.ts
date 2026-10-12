import assert from "node:assert/strict";
import { test } from "node:test";
import { deflateSync } from "node:zlib";
import JSZip from "jszip";
import { documentText } from "../src/background/file-text";

async function zip(files: Record<string, string>) {
  const archive = new JSZip();
  for (const [path, content] of Object.entries(files))
    archive.file(path, content);
  return archive.generateAsync({ type: "uint8array" });
}

// A minimal PDF: one page, a compressed content stream, and a Type0 font
// whose ToUnicode map decodes two-byte codes.
function pdf() {
  const content = deflateSync(
    Buffer.from(
      "BT /F1 12 Tf 72 720 Td (Invoice total:) Tj 0 -14 Td [(Due) -300 (date)] TJ /F2 12 Tf 0 -14 Td <00010002> Tj ET",
    ),
  );
  const cmap =
    "begincmap 2 beginbfchar <0001> <4F60> <0002> <597D> endbfchar endcmap";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>",
    "<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>",
    `<< /Length ${content.length} /Filter /FlateDecode >>\nstream\n${content.toString("latin1")}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type0 /ToUnicode 7 0 R >>",
    `<< /Length ${cmap.length} >>\nstream\n${cmap}\nendstream`,
  ];
  const body = objects
    .map((object, index) => `${index + 1} 0 obj\n${object}\nendobj\n`)
    .join("");
  return new Uint8Array(
    Buffer.from(`%PDF-1.4\n${body}trailer\n<< /Root 1 0 R >>\n%%EOF`, "latin1"),
  );
}

test("PDF text comes out in page order with fonts decoded", async () => {
  assert.equal(
    await documentText(pdf()),
    "[Page 1]\nInvoice total:\nDue date\n你好",
  );
});

test("Word, Excel and PowerPoint files read as text", async () => {
  const word = await zip({
    "word/document.xml":
      '<w:document><w:body><w:p><w:r><w:t>Hello</w:t></w:r><w:r><w:t xml:space="preserve"> world &amp; co</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>A1</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>B1</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>',
  });
  assert.equal(await documentText(word), "Hello world & co\nA1 | B1");
  const sheet = await zip({
    "xl/workbook.xml":
      '<workbook><sheets><sheet name="Sales" sheetId="1" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels":
      '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    "xl/sharedStrings.xml":
      "<sst><si><t>Region</t></si><si><t>North</t></si></sst>",
    "xl/worksheets/sheet1.xml":
      '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="inlineStr"><is><t>Total</t></is></c></row><row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>42.5</v></c></row></sheetData></worksheet>',
  });
  assert.equal(
    await documentText(sheet),
    "## Sheet Sales\nRegion | Total\nNorth | 42.5",
  );
  const slides = await zip({
    "ppt/slides/slide2.xml":
      "<p:sld><a:p><a:r><a:t>Second</a:t></a:r></a:p></p:sld>",
    "ppt/slides/slide1.xml":
      "<p:sld><a:p><a:r><a:t>First</a:t></a:r></a:p></p:sld>",
  });
  assert.equal(
    await documentText(slides),
    "## Slide 1\nFirst\n\n## Slide 2\nSecond",
  );
  assert.equal(await documentText(new Uint8Array([1, 2, 3, 4, 5])), undefined);
});
