import { BYTES_PER_KIB, BYTES_PER_MIB } from "./config";

export function formatBytes(value: number, maxUnit: "kb" | "mb" = "mb") {
  if (value < BYTES_PER_KIB) return `${value} B`;
  if (maxUnit === "kb" || value < BYTES_PER_MIB)
    return `${(value / BYTES_PER_KIB).toFixed(1)} KB`;
  return `${(value / BYTES_PER_MIB).toFixed(1)} MB`;
}

// Drops blank lines before the first and after the last line of user-typed
// text. Keeps the first line's indentation and the line breaks in between.
export function trimBlankLines(text: string) {
  return text.replace(/^(?:[^\S\r\n]*\r?\n)+/, "").trimEnd();
}
