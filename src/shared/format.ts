import { BYTES_PER_KIB, BYTES_PER_MIB, MS_PER_SECOND } from "./config";
import { resolveLanguage } from "./i18n";

// Numbers, sizes and dates shown in the extension UI follow the UI language,
// not the browser's, so they match the text around them.

export function formatNumber(
  value: number,
  options?: Intl.NumberFormatOptions,
) {
  return new Intl.NumberFormat(resolveLanguage(), options).format(value);
}

export function formatBytes(value: number, maxUnit: "kb" | "mb" = "mb") {
  if (value < BYTES_PER_KIB)
    return formatNumber(value, {
      style: "unit",
      unit: "byte",
      unitDisplay: "long",
    });
  const megabytes = maxUnit === "mb" && value >= BYTES_PER_MIB;
  return formatNumber(value / (megabytes ? BYTES_PER_MIB : BYTES_PER_KIB), {
    style: "unit",
    unit: megabytes ? "megabyte" : "kilobyte",
    unitDisplay: "short",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

// "850 ms" under a second, else seconds with two decimals ("1,25 s").
export function formatDuration(milliseconds: number) {
  return milliseconds < MS_PER_SECOND
    ? formatNumber(Math.round(milliseconds), {
        style: "unit",
        unit: "millisecond",
        unitDisplay: "short",
      })
    : formatNumber(milliseconds / MS_PER_SECOND, {
        style: "unit",
        unit: "second",
        unitDisplay: "short",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
}

export function formatDateTime(
  value: number | Date,
  options: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    timeStyle: "short",
  },
) {
  return new Intl.DateTimeFormat(resolveLanguage(), options).format(value);
}

// Drops blank lines before the first and after the last line of user-typed
// text. Keeps the first line's indentation and the line breaks in between.
export function trimBlankLines(text: string) {
  return text.replace(/^(?:[^\S\r\n]*\r?\n)+/, "").trimEnd();
}
