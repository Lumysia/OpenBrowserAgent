import { isRecord } from "../../shared/values";

// Captured traffic goes to the model; the owner's credentials must not.
// Redaction is always on: header values, and values of URL, form and JSON
// fields whose names say they hold a secret, plus anything shaped like a
// credential (bearer tokens, JWTs, long random tokens) wherever it appears.

export const REDACTED = "[redacted]";

// Parts of a header or field name that mark its value as secret. Cookie,
// Set-Cookie, Authorization and Proxy-Authorization are among them.
const SECRET_NAME_PARTS = [
  "token",
  "secret",
  "key",
  "auth",
  "session",
  "sessid",
  "csrf",
  "xsrf",
  "password",
  "passwd",
  "passphrase",
  "pwd",
  "cookie",
  "credential",
  "signature",
];
const SECRET_NAME = new RegExp(SECRET_NAME_PARTS.join("|"), "i");

export const isSecretName = (name: string) => SECRET_NAME.test(name);

const CREDENTIAL = /\b(Bearer|Basic|Token)\s+[\w.~+/=-]{8,}/gi;
const JWT = /\beyJ[\w-]{4,}\.[\w-]{4,}\.[\w-]*/g;
// 32 or more token characters with upper- and lower-case letters and
// digits: random tokens, not words, paths or (lower-case) hex hashes.
const LONG_TOKEN = /(?<![\w+-])[\w+-]{32,}={0,2}(?![\w+-])/g;
const isLongToken = (value: string) =>
  /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value);
// name=value and "name": "value" pairs in text that is neither JSON nor a
// form (console messages, cut bodies).
const PAIR =
  /(["']?)([\w.-]+)\1(\s*[:=]\s*)("(?:[^"\\]|\\.)*(?:"|$)|'[^']*'|[^\s&,;"'}\]]+)/g;

export function redactText(text: string): string {
  return text
    .replace(PAIR, (match, quote, name, separator, value: string) =>
      isSecretName(name)
        ? `${quote}${name}${quote}${separator}${value.startsWith('"') ? `"${REDACTED}"` : REDACTED}`
        : match,
    )
    .replace(CREDENTIAL, (_match, scheme) => `${scheme} ${REDACTED}`)
    .replace(JWT, REDACTED)
    .replace(LONG_TOKEN, (match) => (isLongToken(match) ? REDACTED : match));
}

export function redactHeaders(
  headers: Record<string, unknown> | undefined,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers || {}).map(([name, value]) => [
      name,
      isSecretName(name) ? REDACTED : redactText(String(value)),
    ]),
  );
}

// Redacted query or form fields, or undefined when none needed it (so the
// original spelling is kept).
function redactParams(text: string) {
  const params = new URLSearchParams(text);
  let changed = false;
  const redacted = [...params].map(([name, value]) => {
    const next = isSecretName(name) && value ? REDACTED : redactText(value);
    changed ||= next !== value;
    return [name, next];
  });
  if (!changed) return undefined;
  return new URLSearchParams(redacted)
    .toString()
    .replaceAll(encodeURIComponent(REDACTED), REDACTED);
}

// Query and fragment fields, a password in the URL, token-shaped path
// parts.
export function redactUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return redactText(url);
  }
  if (!/^(https?|wss?):$/.test(parsed.protocol)) return redactText(url);
  const path = parsed.pathname
    .split("/")
    .map((part) => (redactText(part) === part ? part : REDACTED))
    .join("/");
  const query = parsed.search
    ? redactParams(parsed.search.slice(1))
    : undefined;
  const fragment = parsed.hash.includes("=")
    ? redactParams(parsed.hash.slice(1))
    : undefined;
  const auth = parsed.username
    ? `${parsed.username}${parsed.password ? `:${REDACTED}` : ""}@`
    : "";
  return `${parsed.protocol}//${auth}${parsed.host}${path}${
    query === undefined ? parsed.search : `?${query}`
  }${fragment === undefined ? parsed.hash : `#${fragment}`}`;
}

function redactJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactJson);
  if (isRecord(value))
    return Object.fromEntries(
      Object.entries(value).map(([name, item]) => [
        name,
        isSecretName(name) && item !== null && item !== ""
          ? REDACTED
          : redactJson(item),
      ]),
    );
  return typeof value === "string" ? redactText(value) : value;
}

const FORM = /^[\w.%[\]-]+=[^&\s]*(?:&[\w.%[\]-]+=[^&\s]*)*$/;

// A request or response body or a WebSocket message: JSON and forms field
// by field, anything else as text.
export function redactBody(body: string): string {
  const trimmed = body.trim();
  if (/^[[{]/.test(trimmed))
    try {
      const parsed = JSON.parse(trimmed);
      const redacted = JSON.stringify(redactJson(parsed));
      return redacted === JSON.stringify(parsed) ? body : redacted;
    } catch {
      // Not JSON after all: redacted as text.
    }
  if (FORM.test(trimmed)) return redactParams(trimmed) ?? body;
  return redactText(body);
}
