// Three-way merge of a local value with the merged result of uploading an
// older snapshot of it: what changed locally since `base` stays, everything
// else takes the merged result. Keyed arrays merge per row, rows per field.

type Row = Record<string, unknown>;

const same = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);

const rows = (value: unknown) => (Array.isArray(value) ? (value as Row[]) : []);

// `nested` names array fields merged per row, by their key field.
export function rebaseRecord(
  base: Row | undefined,
  mine: Row,
  theirs: Row,
  nested: Record<string, string> = {},
): Row {
  const result: Row = {};
  for (const field of new Set([...Object.keys(theirs), ...Object.keys(mine)])) {
    const value =
      field in nested
        ? rebaseRows(
            rows(base?.[field]),
            rows(mine[field]),
            rows(theirs[field]),
            nested[field],
          )
        : same(mine[field], base?.[field])
          ? theirs[field]
          : mine[field];
    if (value !== undefined) result[field] = value;
  }
  return result;
}

export function rebaseRows(
  base: Row[],
  mine: Row[],
  theirs: Row[],
  keyField: string,
  nested: Record<string, string> = {},
): Row[] {
  const byKey = (items: Row[]) =>
    new Map(items.map((row) => [String(row[keyField]), row]));
  const baseRows = byKey(base);
  const mineRows = byKey(mine);
  const theirRows = byKey(theirs);
  const result: Row[] = [];
  for (const [key, row] of theirRows) {
    const mineRow = mineRows.get(key);
    const baseRow = baseRows.get(key);
    // Deleted here since the snapshot: stays deleted.
    if (!mineRow) {
      if (!baseRow) result.push(row);
      continue;
    }
    result.push(rebaseRecord(baseRow, mineRow, row, nested));
  }
  // Added here, or changed here while removed elsewhere.
  for (const [key, row] of mineRows) {
    if (theirRows.has(key)) continue;
    const baseRow = baseRows.get(key);
    if (!baseRow || !same(row, baseRow)) result.push(row);
  }
  return result;
}
