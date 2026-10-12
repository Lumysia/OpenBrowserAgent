// Text of a PDF without a PDF library: the page content streams in page
// order, decoded with each font's ToUnicode map where it has one. Enough for
// text PDFs (reports, papers, invoices); scanned pages have no text.

// Interfaces, not object types: they get no implicit index signature, so
// `isDict` tells them apart from dictionaries.
interface Ref {
  ref: number;
}
interface PdfString {
  bytes: string;
}
type Value =
  number | string | boolean | null | Ref | PdfString | Value[] | Dict;
type Dict = { [key: string]: Value };
type PdfObject = { value: Value; stream?: Uint8Array };
type Font = { cmap?: Map<number, string>; width: number };

const DELIMITERS = "()<>[]{}/%";
const isSpace = (char: string) => /[\s\0]/.test(char);

export async function pdfText(bytes: Uint8Array) {
  const source = latin1(bytes);
  const objects = new Map<number, PdfObject>();
  const header = /(\d+)\s+\d+\s+obj\b/g;
  for (let match; (match = header.exec(source));) {
    const parser = new Parser(source, header.lastIndex);
    const value = parser.value();
    const object: PdfObject = { value };
    const after = source.slice(parser.pos, parser.pos + 20);
    const stream = after.match(/^\s*stream\r?\n/);
    if (stream && isDict(value)) {
      const start = parser.pos + stream[0].length;
      const length = typeof value.Length === "number" ? value.Length : -1;
      const ends =
        length >= 0 && /^\s*endstream/.test(source.slice(start + length))
          ? start + length
          : source.indexOf("endstream", start);
      object.stream = bytes.subarray(start, ends < 0 ? bytes.length : ends);
      header.lastIndex = Math.max(header.lastIndex, ends);
    }
    objects.set(Number(match[1]), object);
  }
  // Objects packed in object streams.
  for (const object of [...objects.values()]) {
    if (!isDict(object.value) || object.value.Type !== "/ObjStm") continue;
    const data = latin1(await decodeStream(object.value, object.stream));
    const first = Number(object.value.First) || 0;
    const pairs = data.slice(0, first).trim().split(/\s+/).map(Number);
    for (let index = 0; index + 1 < pairs.length; index += 2)
      if (!objects.has(pairs[index]))
        objects.set(pairs[index], {
          value: new Parser(data, first + pairs[index + 1]).value(),
        });
  }
  const resolve = (value: Value | undefined): Value | undefined =>
    isRef(value) ? objects.get(value.ref)?.value : value;
  const fonts = new Map<number, Font>();
  const fontFor = async (value: Value | undefined): Promise<Font> => {
    const ref = isRef(value) ? value.ref : -1;
    if (fonts.has(ref)) return fonts.get(ref)!;
    const dict = resolve(value);
    const font: Font = { width: 1 };
    if (isDict(dict)) {
      if (dict.Subtype === "/Type0") font.width = 2;
      const unicode = isRef(dict.ToUnicode)
        ? objects.get(dict.ToUnicode.ref)
        : undefined;
      if (unicode?.stream && isDict(unicode.value))
        font.cmap = parseCMap(
          latin1(await decodeStream(unicode.value, unicode.stream)),
        );
    }
    fonts.set(ref, font);
    return font;
  };

  const pages: Array<{ page: Dict; resources?: Dict }> = [];
  const visit = (node: Value | undefined, resources?: Dict, depth = 0) => {
    const dict = resolve(node);
    if (!isDict(dict) || depth > 50) return;
    const own = resolve(dict.Resources);
    const inherited = isDict(own) ? own : resources;
    if (Array.isArray(dict.Kids))
      for (const kid of dict.Kids) visit(kid, inherited, depth + 1);
    else if (dict.Type === "/Page" || dict.Contents)
      pages.push({ page: dict, resources: inherited });
  };
  const root = [...source.matchAll(/\/Root\s+(\d+)\s+\d+\s+R/g)].at(-1);
  const catalog = root ? resolve({ ref: Number(root[1]) }) : undefined;
  if (isDict(catalog)) visit(catalog.Pages);
  if (!pages.length)
    for (const object of objects.values())
      if (isDict(object.value) && object.value.Type === "/Page")
        pages.push({ page: object.value, resources: undefined });

  const texts: string[] = [];
  for (const [index, { page, resources }] of pages.entries()) {
    const contents = resolve(page.Contents);
    const parts = (Array.isArray(contents) ? contents : [page.Contents])
      .map((item) => (isRef(item) ? objects.get(item.ref) : undefined))
      .filter((item): item is PdfObject => !!item?.stream);
    let content = "";
    for (const part of parts)
      content += `${latin1(await decodeStream(part.value as Dict, part.stream))}\n`;
    const fontDict = resolve(resources?.Font);
    const pageFonts = new Map<string, Font>();
    if (isDict(fontDict))
      for (const [name, value] of Object.entries(fontDict))
        pageFonts.set(`/${name}`, await fontFor(value));
    const text = contentText(content, pageFonts).trim();
    if (text) texts.push(`[Page ${index + 1}]\n${text}`);
  }
  return texts.join("\n\n");
}

function latin1(bytes: Uint8Array) {
  let text = "";
  for (let index = 0; index < bytes.length; index += 0x8000)
    text += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return text;
}

const isRef = (value: unknown): value is Ref =>
  !!value && typeof value === "object" && "ref" in value;
const isString = (value: unknown): value is PdfString =>
  !!value && typeof value === "object" && "bytes" in value;
const isDict = (value: unknown): value is Dict =>
  !!value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  !("ref" in value) &&
  !("bytes" in value);

// Flate is the only filter text streams use in practice; a stream with
// another filter yields nothing.
async function decodeStream(dict: Dict, data: Uint8Array | undefined) {
  if (!data) return new Uint8Array();
  const filters = [dict.Filter].flat().filter(Boolean);
  if (!filters.length) return data;
  if (filters.length > 1 || filters[0] !== "/FlateDecode")
    return new Uint8Array();
  const reader = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate"))
    .getReader();
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
  } catch {
    // Trailing bytes after the compressed data; keep what was read.
  }
  const out = new Uint8Array(chunks.reduce((sum, c) => sum + c.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

class Parser {
  constructor(
    private text: string,
    public pos: number,
  ) {}

  private skip() {
    for (;;) {
      while (this.pos < this.text.length && isSpace(this.text[this.pos]))
        this.pos++;
      if (this.text[this.pos] !== "%") return;
      while (this.pos < this.text.length && !/[\r\n]/.test(this.text[this.pos]))
        this.pos++;
    }
  }

  // The next token: a value, or an operator word as { op }.
  token(): Value | { op: string } | undefined {
    this.skip();
    const text = this.text;
    const char = text[this.pos];
    if (char === undefined) return undefined;
    if (char === "/") {
      const start = this.pos++;
      while (
        this.pos < text.length &&
        !isSpace(text[this.pos]) &&
        !DELIMITERS.includes(text[this.pos])
      )
        this.pos++;
      return text.slice(start, this.pos);
    }
    if (char === "(") return { bytes: this.literal() };
    if (char === "<" && text[this.pos + 1] === "<") {
      this.pos += 2;
      const dict: Dict = {};
      for (;;) {
        this.skip();
        if (text.startsWith(">>", this.pos) || this.pos >= text.length) break;
        const key = this.token();
        const value = this.value();
        if (typeof key === "string") dict[key.slice(1)] = value;
      }
      this.pos += 2;
      return dict;
    }
    if (char === "<") {
      const end = text.indexOf(">", this.pos);
      const hex = text.slice(this.pos + 1, end).replace(/\s+/g, "");
      this.pos = end + 1;
      let bytes = "";
      for (let index = 0; index < hex.length; index += 2)
        bytes += String.fromCharCode(
          parseInt(hex.slice(index, index + 2).padEnd(2, "0"), 16),
        );
      return { bytes };
    }
    if (char === "[") {
      this.pos++;
      const items: Value[] = [];
      for (;;) {
        this.skip();
        if (text[this.pos] === "]" || this.pos >= text.length) break;
        items.push(this.value());
      }
      this.pos++;
      return items;
    }
    if (char === "]" || char === ">" || char === ")") {
      this.pos++;
      return this.token();
    }
    const start = this.pos;
    while (
      this.pos < text.length &&
      !isSpace(text[this.pos]) &&
      !DELIMITERS.includes(text[this.pos])
    )
      this.pos++;
    if (start === this.pos) this.pos++;
    const word = text.slice(start, this.pos);
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word)) {
      // "12 0 R" is a reference.
      const after = text.slice(this.pos).match(/^\s+(\d+)\s+R(?![A-Za-z])/);
      if (/^\d+$/.test(word) && after) {
        this.pos += after[0].length;
        return { ref: Number(word) };
      }
      return Number(word);
    }
    if (word === "true" || word === "false") return word === "true";
    if (word === "null") return null;
    return { op: word };
  }

  value(): Value {
    const token = this.token();
    return token && typeof token === "object" && "op" in token
      ? null
      : (token ?? null);
  }

  private literal() {
    const text = this.text;
    let depth = 0;
    let out = "";
    for (this.pos++; this.pos < text.length; this.pos++) {
      const char = text[this.pos];
      if (char === "\\") {
        const next = text[++this.pos];
        const octal = text.slice(this.pos).match(/^[0-7]{1,3}/)?.[0];
        if (octal) {
          out += String.fromCharCode(parseInt(octal, 8) & 0xff);
          this.pos += octal.length - 1;
        } else if (next === "\r" || next === "\n") {
          if (next === "\r" && text[this.pos + 1] === "\n") this.pos++;
        } else
          out += { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" }[next] ?? next;
      } else if (char === "(") {
        depth++;
        out += char;
      } else if (char === ")") {
        if (!depth--) break;
        out += char;
      } else out += char;
    }
    this.pos++;
    return out;
  }
}

function parseCMap(text: string) {
  const map = new Map<number, string>();
  const unicode = (hex: string) => {
    let out = "";
    for (let index = 0; index + 3 < hex.length; index += 4)
      out += String.fromCharCode(parseInt(hex.slice(index, index + 4), 16));
    return out || String.fromCharCode(parseInt(hex, 16));
  };
  for (const [, body] of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
    for (const [, code, dest] of body.matchAll(/<(\w+)>\s*<(\w*)>/g))
      map.set(parseInt(code, 16), unicode(dest));
  for (const [, body] of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g))
    for (const [, lo, hi, rest] of body.matchAll(
      /<(\w+)>\s*<(\w+)>\s*(<\w*>|\[[^\]]*\])/g,
    )) {
      const start = parseInt(lo, 16);
      const end = Math.min(parseInt(hi, 16), start + 0xffff);
      if (rest.startsWith("[")) {
        const items = [...rest.matchAll(/<(\w*)>/g)].map((item) => item[1]);
        items.forEach((dest, index) => map.set(start + index, unicode(dest)));
      } else {
        const base = unicode(rest.slice(1, -1));
        for (let code = start; code <= end; code++)
          map.set(
            code,
            base.slice(0, -1) +
              String.fromCharCode(
                base.charCodeAt(base.length - 1) + code - start,
              ),
          );
      }
    }
  return map;
}

// Runs the text operators of a content stream.
function contentText(content: string, fonts: Map<string, Font>) {
  const parser = new Parser(content, 0);
  const operands: Value[] = [];
  let font: Font = { width: 1 };
  let out = "";
  let lastY: number | undefined;
  const newline = () => {
    if (out && !out.endsWith("\n")) out += "\n";
  };
  const show = (value: Value) => {
    if (!isString(value)) return;
    const bytes = value.bytes;
    for (let index = 0; index < bytes.length; index += font.width) {
      const code =
        font.width === 2
          ? (bytes.charCodeAt(index) << 8) | bytes.charCodeAt(index + 1)
          : bytes.charCodeAt(index);
      out += font.cmap
        ? (font.cmap.get(code) ?? "")
        : font.width === 1
          ? String.fromCharCode(code)
          : "";
    }
  };
  for (let token; (token = parser.token()) !== undefined;) {
    if (!token || typeof token !== "object" || !("op" in token)) {
      operands.push(token as Value);
      continue;
    }
    const op = token.op;
    if (op === "BI") {
      const end = content.indexOf("EI", parser.pos);
      parser.pos = end < 0 ? content.length : end + 2;
    } else if (op === "Tf") font = fonts.get(String(operands[0])) || font;
    else if (op === "Tj") show(operands[0]);
    else if (op === "'" || op === '"') {
      newline();
      show(operands.at(-1)!);
    } else if (op === "TJ" && Array.isArray(operands[0]))
      for (const item of operands[0])
        if (typeof item === "number") {
          if (item < -200 && !out.endsWith(" ")) out += " ";
        } else show(item);
    else if ((op === "Td" || op === "TD") && Number(operands[1])) newline();
    else if (op === "T*") newline();
    else if (op === "Tm") {
      const y = Number(operands[5]);
      if (lastY !== undefined && y !== lastY) newline();
      else if (!/\s$/.test(out)) out += " ";
      lastY = y;
    }
    operands.length = 0;
  }
  return out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
}
