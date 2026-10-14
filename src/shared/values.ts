// Reading untyped values: stored data, messages, tool arguments.

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

// The value when it is a plain object, else an empty one.
export function recordOf(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

// The string as it is, else "".
export function stringOf(value: unknown) {
  return typeof value === "string" ? value : "";
}

// The string without surrounding whitespace, else "".
export function trimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function finiteNumber(value: unknown, fallback: number): number;
export function finiteNumber(
  value: unknown,
  fallback?: number,
): number | undefined;
export function finiteNumber(value: unknown, fallback?: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

// A whole number from a number or numeric string, held within [min, max];
// `fallback` when there is none.
export function clampInt(
  value: unknown,
  { fallback, min, max }: { fallback: number; min: number; max?: number },
) {
  const number =
    typeof value === "string" && value.trim() ? Number(value) : value;
  if (typeof number !== "number" || !Number.isFinite(number)) return fallback;
  return Math.min(max ?? Infinity, Math.max(min, Math.trunc(number)));
}

// `value` when it is one of `values`, else `fallback`.
export function oneOf<T extends string>(
  values: readonly T[],
  value: unknown,
  fallback: T,
): T {
  return values.includes(value as T) ? (value as T) : fallback;
}

// The entries of `list` that are among `values`, once each, in order.
export function knownValues<T extends string>(
  values: readonly T[],
  list: unknown,
): T[] {
  return Array.isArray(list)
    ? [...new Set(list.filter((value): value is T => values.includes(value)))]
    : [];
}
