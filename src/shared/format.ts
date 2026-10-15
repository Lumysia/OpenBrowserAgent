import { BYTES_PER_KIB, BYTES_PER_MIB, MS_PER_SECOND } from "./config";

// Numbers, sizes and dates shown in the extension UI follow the UI language,
// not the browser's, so they match the text around them. Callers pass that
// language (`languageOf(t)` for the messages they show it with).

export function formatNumber(
  language: string,
  value: number,
  options?: Intl.NumberFormatOptions,
) {
  return new Intl.NumberFormat(language, options).format(value);
}

export function formatBytes(
  language: string,
  value: number,
  maxUnit: "kb" | "mb" = "mb",
) {
  if (value < BYTES_PER_KIB)
    return formatNumber(language, value, {
      style: "unit",
      unit: "byte",
      unitDisplay: "long",
    });
  const megabytes = maxUnit === "mb" && value >= BYTES_PER_MIB;
  return formatNumber(
    language,
    value / (megabytes ? BYTES_PER_MIB : BYTES_PER_KIB),
    {
      style: "unit",
      unit: megabytes ? "megabyte" : "kilobyte",
      unitDisplay: "short",
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    },
  );
}

// A size in text the model reads, which stays English whatever the UI
// language ("850 B", "2.3 MB").
export function formatBytesForModel(value: number) {
  if (value < BYTES_PER_KIB) return `${value} B`;
  if (value < BYTES_PER_MIB) return `${(value / BYTES_PER_KIB).toFixed(1)} KB`;
  return `${(value / BYTES_PER_MIB).toFixed(1)} MB`;
}

// "850 ms" under a second, else seconds with two decimals ("1,25 s").
export function formatDuration(language: string, milliseconds: number) {
  return milliseconds < MS_PER_SECOND
    ? formatNumber(language, Math.round(milliseconds), {
        style: "unit",
        unit: "millisecond",
        unitDisplay: "short",
      })
    : formatNumber(language, milliseconds / MS_PER_SECOND, {
        style: "unit",
        unit: "second",
        unitDisplay: "short",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
}

export function formatDateTime(
  language: string,
  value: number | Date,
  options: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    timeStyle: "short",
  },
) {
  return new Intl.DateTimeFormat(language, options).format(value);
}

// Drops blank lines before the first and after the last line of user-typed
// text. Keeps the first line's indentation and the line breaks in between.
export function trimBlankLines(text: string) {
  return text.replace(/^(?:[^\S\r\n]*\r?\n)+/, "").trimEnd();
}
