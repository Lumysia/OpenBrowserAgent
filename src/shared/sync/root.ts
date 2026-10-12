import { gunzip, gzip, isBlobHash, jsonBytes, bytesText } from "./codec";
import { compareClocks, isClock, type Clock } from "./hlc";

// The root file: the only remote file that is ever overwritten. It lists
// every synced record. Small values live inline (`data`); large ones live in
// immutable blobs named by the SHA-256 of their content (`blob`). Deletions
// are records too (`deleted`), so a missing record or blob never means
// "deleted".

export const ROOT_FORMAT = "openbrowseragent.sync.v2";
const ROOT_FORMAT_PREFIX = "openbrowseragent.sync.";

export type SyncRecord = {
  clock: Clock;
  deleted?: true;
  data?: unknown;
  blob?: string;
  // Payload bytes of the blob.
  size?: number;
};

// Blobs a writer stopped referring to; any device deletes them a day later.
export type GarbageEntry = { blob: string; since: number };

export type Root = {
  format: typeof ROOT_FORMAT;
  writer: string;
  records: Record<string, SyncRecord>;
  garbage: GarbageEntry[];
};

export class SyncFormatError extends Error {
  constructor(
    message: string,
    readonly newerFormat = false,
  ) {
    super(message);
  }
}

export const emptyRoot = (writer = ""): Root => ({
  format: ROOT_FORMAT,
  writer,
  records: {},
  garbage: [],
});

const RECORD_ID_PATTERN = /^[a-z][a-z-]*\/[^\s]{1,400}$/;

export const isRecordId = (id: string) => RECORD_ID_PATTERN.test(id);

// A root is applied only after every part of it checked out: a truncated or
// foreign file must never turn into deletions or overwrite local data.
export function validateRoot(value: unknown): Root {
  if (!isObject(value))
    throw new SyncFormatError("Sync root is not an object.");
  if (value.format !== ROOT_FORMAT) {
    const newer =
      typeof value.format === "string" &&
      value.format.startsWith(ROOT_FORMAT_PREFIX) &&
      value.format > ROOT_FORMAT;
    throw new SyncFormatError(
      `Unsupported sync root format: ${String(value.format)}`,
      newer,
    );
  }
  if (typeof value.writer !== "string")
    throw new SyncFormatError("Sync root has no writer.");
  if (!isObject(value.records))
    throw new SyncFormatError("Sync root has no records.");
  for (const [id, record] of Object.entries(value.records)) {
    const problem = recordProblem(id, record);
    if (problem) throw new SyncFormatError(`Sync record ${id}: ${problem}`);
  }
  if (!Array.isArray(value.garbage))
    throw new SyncFormatError("Sync root has no garbage list.");
  for (const entry of value.garbage)
    if (
      !isObject(entry) ||
      !isBlobHash(entry.blob) ||
      typeof entry.since !== "number" ||
      !Number.isFinite(entry.since)
    )
      throw new SyncFormatError("Sync root has an invalid garbage entry.");
  return value as Root;
}

function recordProblem(id: string, record: unknown) {
  if (!isRecordId(id)) return "invalid id";
  if (!isObject(record)) return "not an object";
  if (!isClock(record.clock)) return "invalid clock";
  if (record.deleted !== undefined) {
    if (record.deleted !== true) return "invalid deleted flag";
    if ("data" in record || "blob" in record) return "tombstone with content";
    return "";
  }
  if (!("data" in record) && !("blob" in record)) return "no content";
  if (record.blob !== undefined && !isBlobHash(record.blob))
    return "invalid blob hash";
  if (
    record.size !== undefined &&
    (typeof record.size !== "number" || record.size < 0)
  )
    return "invalid size";
  return "";
}

export async function encodeRoot(root: Root) {
  return gzip(jsonBytes(root));
}

export async function decodeRoot(bytes: Uint8Array) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytesText(await gunzip(bytes)));
  } catch {
    throw new SyncFormatError("Sync root is not valid gzip JSON.");
  }
  return validateRoot(parsed);
}

// The newest clock in a root, so this device's next clocks order after it.
export function maxRootClock(root: Root) {
  let max: Clock | undefined;
  for (const record of Object.values(root.records))
    if (compareClocks(record.clock, max) > 0) max = record.clock;
  return max;
}

// Blobs a root refers to.
export function referencedBlobs(root: Root) {
  const blobs = new Set<string>();
  for (const record of Object.values(root.records))
    if (record.blob) blobs.add(record.blob);
  return blobs;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
