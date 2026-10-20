import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

// Pages echo what the user typed: a suggestion "Search for <term>", a title
// "<term> - Results", a heading, a path /search/<term>. Every string a
// recording keeps passes through here first and loses such echoes.
//
// Text is compared by its letters and digits only, lowercased, so case,
// spaces, hyphens and punctuation do not hide an echo. The recorder in the
// page compares with the values themselves (those typed in its document,
// secret or not). So that later pages of the same recording, and the
// navigations the background sees, are redacted too, the recorder also
// gives a keyed fingerprint of each non-secret value (`typedFingerprint`):
// the recording keeps only those, never the value.

export const TYPED_VALUE_MARKER = "«typed value»";

// Shorter entries ("12", "ok") would match everywhere.
export const MIN_TYPED_CHARS = 3;

// Characters of a fingerprint (hex of HMAC-SHA-256, cut).
const FINGERPRINT_HEX = 24;

// Fingerprints a recording keeps at most.
export const MAX_FINGERPRINTS = 300;

type Compact = { text: string; starts: number[]; ends: number[] };

// The letters and digits of `value`, lowercased, with where each came from.
function compactText(value: string): Compact {
  const compact: Compact = { text: "", starts: [], ends: [] };
  let index = 0;
  for (const char of value) {
    const end = index + char.length;
    for (const part of char.normalize("NFKC").toLowerCase())
      if (/[\p{L}\p{N}]/u.test(part)) {
        compact.text += part;
        compact.starts.push(index);
        compact.ends.push(end);
      }
    index = end;
  }
  return compact;
}

// A value's compact form, or "" when it is too short to look for.
export function typedForm(value: string) {
  const { text } = compactText(value);
  return text.length >= MIN_TYPED_CHARS ? text : "";
}

const fingerprintOf = (key: string, form: string) =>
  `${form.length}:${bytesToHex(hmac(sha256, utf8ToBytes(key), utf8ToBytes(form))).slice(0, FINGERPRINT_HEX)}`;

// The fingerprint of a typed value under the recording's key; "" when the
// value is too short to look for.
export function typedFingerprint(key: string, value: string) {
  const form = typedForm(value);
  return form ? fingerprintOf(key, form) : "";
}

export function newFingerprintKey() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

// What to look for: values in their compact form, and fingerprints with
// the key they were made with.
export type TypedValues = {
  forms?: string[];
  key?: string;
  fingerprints?: readonly string[];
};

type Range = [number, number];

function matches(compact: string, typed: TypedValues): Range[] {
  const ranges: Range[] = [];
  for (const form of typed.forms || []) {
    if (!form) continue;
    for (
      let at = compact.indexOf(form);
      at >= 0;
      at = compact.indexOf(form, at + 1)
    )
      ranges.push([at, at + form.length]);
  }
  if (!typed.key || !typed.fingerprints?.length) return ranges;
  const wanted = new Set(typed.fingerprints);
  const lengths = new Set(
    typed.fingerprints.map((item) => Number(item.split(":")[0])),
  );
  for (const length of lengths) {
    if (!(length >= MIN_TYPED_CHARS)) continue;
    for (let at = 0; at + length <= compact.length; at++)
      if (wanted.has(fingerprintOf(typed.key, compact.slice(at, at + length))))
        ranges.push([at, at + length]);
  }
  return ranges;
}

const isEmpty = (typed: TypedValues) =>
  !typed.forms?.some(Boolean) && !(typed.key && typed.fingerprints?.length);

// `value` with each echo of a typed value replaced by TYPED_VALUE_MARKER.
export function redactText(value: string, typed: TypedValues) {
  if (!value || isEmpty(typed)) return value;
  const compact = compactText(value);
  const ranges = matches(compact.text, typed)
    .map(([start, end]): Range => [
      compact.starts[start],
      compact.ends[end - 1],
    ])
    .sort((a, b) => a[0] - b[0]);
  if (!ranges.length) return value;
  let result = "";
  let at = 0;
  for (const [start, end] of ranges) {
    if (end <= at) continue;
    if (start >= at) result += value.slice(at, start) + TYPED_VALUE_MARKER;
    at = end;
  }
  return result + value.slice(at);
}

// A URL with each path part that holds an echo replaced by the marker, read
// decoded (/find/divorce%20lawyer). The origin is where the user went, not
// an echo, and stays.
export function redactUrl(value: string, typed: TypedValues) {
  if (!value || isEmpty(typed)) return value;
  // Taken apart as written: a URL object would encode the marker.
  const parts = /^([a-z][a-z0-9+.-]*:\/\/[^/?#]*)([^?#]*)(.*)$/i.exec(value);
  if (!parts) return redactText(value, typed);
  const [, origin, path, rest] = parts;
  const redacted = path.split("/").map((part) => {
    let decoded = part;
    try {
      decoded = decodeURIComponent(part);
    } catch {
      // Read as written.
    }
    return redactText(decoded, typed) === decoded ? part : TYPED_VALUE_MARKER;
  });
  return `${origin}${redacted.join("/")}${redactText(rest, typed)}`;
}

const looksLikeUrl = (value: string) => /^https?:\/\//i.test(value);

// Keys whose strings are the recorder's own bookkeeping, not page text.
const OWN_KEYS = new Set(["id", "kind", "inputType", "typed"]);

// Every string in `value` (a step, an event), URLs part by part.
export function redactStrings<T>(value: T, typed: TypedValues): T {
  if (isEmpty(typed)) return value;
  const walk = (item: unknown, key = ""): unknown => {
    if (typeof item === "string")
      return OWN_KEYS.has(key)
        ? item
        : looksLikeUrl(item)
          ? redactUrl(item, typed)
          : redactText(item, typed);
    if (Array.isArray(item)) return item.map((entry) => walk(entry));
    if (item && typeof item === "object")
      return Object.fromEntries(
        Object.entries(item).map(([name, entry]) => [name, walk(entry, name)]),
      );
    return item;
  };
  return walk(value) as T;
}

// Fingerprints kept so far plus new ones, without repeats, at most
// MAX_FINGERPRINTS (the newest).
export function mergeFingerprints(
  kept: readonly string[] = [],
  added: readonly string[] = [],
) {
  return [...new Set([...kept, ...added].filter(Boolean))].slice(
    -MAX_FINGERPRINTS,
  );
}
