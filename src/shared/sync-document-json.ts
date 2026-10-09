type JsonPath = Array<string | number>;

// setMergeableContent silently ignores malformed input. Reject corrupt remote
// envelopes before treating them as an empty document or persisting them locally.
export function assertMergeableContent(content: unknown) {
  if (
    !Array.isArray(content) ||
    content.length !== 2 ||
    !isStamp(content[0], 3) ||
    !isStamp(content[1], 1)
  )
    throw new Error("Invalid TinyBase sync content.");
}

function isStamp(value: unknown, depth: number): boolean {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    typeof value[1] !== "string" ||
    typeof value[2] !== "number" ||
    !Number.isFinite(value[2])
  )
    return false;
  if (!depth) return true;
  return (
    !!value[0] &&
    typeof value[0] === "object" &&
    !Array.isArray(value[0]) &&
    Object.values(value[0]).every((child) => isStamp(child, depth - 1))
  );
}

// JSON turns undefined array elements into null. TinyBase uses undefined for
// tombstones and supports real null values, so their locations must travel with
// the document. Paths avoid reserving any string/object value in user data.
export function undefinedPaths(
  value: unknown,
  path: JsonPath = [],
): JsonPath[] {
  if (value === undefined) return [path];
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) =>
    undefinedPaths(child, [...path, Array.isArray(value) ? Number(key) : key]),
  );
}

export function restoreUndefinedPaths(value: unknown, paths: unknown) {
  if (paths === undefined) return;
  if (!Array.isArray(paths))
    throw new Error("Invalid sync document tombstones.");
  for (const path of paths) {
    if (!Array.isArray(path) || !path.length)
      throw new Error("Invalid sync document tombstone path.");
    let parent = value;
    for (const [index, key] of path.entries()) {
      if (
        (typeof key !== "string" && typeof key !== "number") ||
        !parent ||
        typeof parent !== "object" ||
        !Object.hasOwn(parent, key)
      )
        throw new Error("Invalid sync document tombstone path.");
      const record = parent as Record<string | number, unknown>;
      if (index === path.length - 1) {
        if (record[key] !== null)
          throw new Error("Invalid sync document tombstone value.");
        record[key] = undefined;
      } else parent = record[key];
    }
  }
}
