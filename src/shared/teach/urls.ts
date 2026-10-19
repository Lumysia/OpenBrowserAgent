// URLs and ids in a recording: only what stays true next time and says
// nothing private. Queries, fragments and credentials are dropped; path
// parts that are record ids become `*`; ids a framework generated are not
// kept at all.

// origin + path, or "" for anything but http(s).
export function cleanUrl(value: string | undefined) {
  if (!value) return "";
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "";
  }
  if (!/^https?:$/.test(url.protocol)) return "";
  return `${url.origin}${url.pathname}`;
}

export function originOf(value: string | undefined) {
  const clean = cleanUrl(value);
  return clean ? new URL(clean).origin : "";
}

export function hostOf(value: string | undefined) {
  const clean = cleanUrl(value);
  return clean ? new URL(clean).host : "";
}

// A path part that names one record (an order number, a uuid, a hash)
// rather than a place on the site.
function isRecordId(part: string) {
  if (!part) return false;
  let decoded = part;
  try {
    decoded = decodeURIComponent(part);
  } catch {
    // Kept as written.
  }
  return (
    /^\d+$/.test(decoded) ||
    /^[0-9a-f]{8,}$/i.test(decoded.replaceAll("-", "")) ||
    looksGenerated(decoded) ||
    // Long mixed tokens ("aZ3kQ9…").
    (decoded.length >= 16 && /\d/.test(decoded) && /[a-z]/i.test(decoded))
  );
}

// The page as origin + path with record ids as `*`: "https://shop.test/
// orders/*/edit".
export function urlPattern(value: string | undefined) {
  const clean = cleanUrl(value);
  if (!clean) return "";
  const url = new URL(clean);
  const path = url.pathname
    .split("/")
    .map((part) => (isRecordId(part) ? "*" : part))
    .join("/");
  return `${url.origin}${path}`;
}

// An id or name attribute a framework or build step made up (React's
// ":r1:", "ember123", "input-4821", a uuid, "x7f3k9"), so it will not be
// the same next time.
function looksGenerated(value: string) {
  if (/[:«»]/.test(value)) return true;
  if (/\d{3,}/.test(value)) return true;
  return value
    .split(/[-_.]/)
    .some(
      (part) =>
        (/^[0-9a-f]{6,}$/i.test(part) && /\d/.test(part)) ||
        (part.length >= 5 &&
          /[a-z]/i.test(part) &&
          (part.match(/\d/g)?.length || 0) >= 2),
    );
}

// The id or name attribute, if it is worth keeping as a hint.
export function stableAttribute(value: string | null | undefined) {
  const trimmed = value?.trim() || "";
  if (!trimmed || trimmed.length > 60 || looksGenerated(trimmed)) return "";
  return trimmed;
}
