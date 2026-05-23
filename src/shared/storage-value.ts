export function isEmptyStorageValue(value: unknown) {
  if (Array.isArray(value)) return value.length === 0;
  return (
    value !== null &&
    typeof value === "object" &&
    Object.keys(value as Record<string, unknown>).length === 0
  );
}

export function sameStorageValue(left: unknown, right: unknown) {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return Object.is(left, right);
  }
}
