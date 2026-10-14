// Small label helpers shared by the tool detail lines.

export function shortValue(value: unknown, maxLength = 140) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

export function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

export function compactJoin(values: Array<string | undefined>) {
  return values.filter(Boolean).join(" · ");
}
