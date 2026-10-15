import { isRecord } from "../values";
import { gunzip, gzip, isBlobHash, jsonBytes, bytesText } from "./codec";
import { compareClocks, isClock, type Clock } from "./hlc";

// The root file: the only remote file that is ever overwritten. It lists
// every synced record. Small values live inline (`data`); large ones live in
// immutable blobs named by the SHA-256 of their content (`blob`). Deletions
// are records too (`deleted`), so a missing record or blob never means
// "deleted". Records of encrypted collections hold `sealed` instead of
// `data`, readable with the key of the root's `keyring` (keys.ts).

export const ROOT_FORMAT = "openbrowseragent.sync.v3";
const ROOT_FORMAT_VERSION = /^openbrowseragent\.sync\.v(\d+)$/;

const formatVersion = (format: unknown) =>
  typeof format === "string"
    ? Number(ROOT_FORMAT_VERSION.exec(format)?.[1] ?? NaN)
    : NaN;

export type SyncRecord = {
  clock: Clock;
  deleted?: true;
  data?: unknown;
  // `data` encrypted (base64 of IV and AES-GCM ciphertext).
  sealed?: string;
  blob?: string;
  // Payload bytes of the blob.
  size?: number;
  // Per device id, the clock of its newest change this version includes
  // besides its own (it was made from, or merged with, a version holding
  // it). A device knows the record holds a change it pushed when the
  // record's clock or one of these is exactly that change's clock.
  seen?: Clock[];
};

// Blobs a writer stopped referring to; any device deletes them a day later.
type GarbageEntry = { blob: string; since: number };

// What a device needs, with the sync passphrase, to read sealed records:
// the PBKDF2 salt and iterations, and a known text sealed with the key, so a
// wrong passphrase is told apart from a right one.
export type Keyring = { salt: string; iterations: number; check: string };

export type Root = {
  format: typeof ROOT_FORMAT;
  writer: string;
  records: Record<string, SyncRecord>;
  garbage: GarbageEntry[];
  keyring?: Keyring;
};

// A root this version cannot use. A newer format stops sync until this
// device is updated; anything else (an older format, a damaged file) is
// replaced by the next write (see the engine).
export class SyncFormatError extends Error {
  constructor(
    message: string,
    readonly newerFormat = false,
    readonly olderFormat = false,
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

const isRecordId = (id: string) => RECORD_ID_PATTERN.test(id);

// A root is applied only after every part of it checked out: a truncated or
// foreign file must never turn into deletions or overwrite local data.
export function validateRoot(value: unknown): Root {
  if (!isRecord(value))
    throw new SyncFormatError("Sync root is not an object.");
  if (value.format !== ROOT_FORMAT) {
    const version = formatVersion(value.format);
    const current = formatVersion(ROOT_FORMAT);
    throw new SyncFormatError(
      `Unsupported sync root format: ${String(value.format)}`,
      version > current,
      version < current,
    );
  }
  if (typeof value.writer !== "string")
    throw new SyncFormatError("Sync root has no writer.");
  if (!isRecord(value.records))
    throw new SyncFormatError("Sync root has no records.");
  for (const [id, record] of Object.entries(value.records)) {
    const problem = recordProblem(id, record);
    if (problem) throw new SyncFormatError(`Sync record ${id}: ${problem}`);
  }
  if (!Array.isArray(value.garbage))
    throw new SyncFormatError("Sync root has no garbage list.");
  for (const entry of value.garbage)
    if (
      !isRecord(entry) ||
      !isBlobHash(entry.blob) ||
      typeof entry.since !== "number" ||
      !Number.isFinite(entry.since)
    )
      throw new SyncFormatError("Sync root has an invalid garbage entry.");
  if (value.keyring !== undefined && !isKeyring(value.keyring))
    throw new SyncFormatError("Sync root has an invalid keyring.");
  return value as Root;
}

function recordProblem(id: string, record: unknown) {
  if (!isRecordId(id)) return "invalid id";
  if (!isRecord(record)) return "not an object";
  if (!isClock(record.clock)) return "invalid clock";
  if (
    record.seen !== undefined &&
    (!Array.isArray(record.seen) || !record.seen.every(isClock))
  )
    return "invalid seen clocks";
  if (record.deleted !== undefined) {
    if (record.deleted !== true) return "invalid deleted flag";
    if ("data" in record || "blob" in record || "sealed" in record)
      return "tombstone with content";
    return "";
  }
  if (!("data" in record) && !("blob" in record) && !("sealed" in record))
    return "no content";
  if (record.sealed !== undefined && typeof record.sealed !== "string")
    return "invalid sealed data";
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

function isKeyring(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.salt === "string" &&
    typeof value.check === "string" &&
    typeof value.iterations === "number" &&
    Number.isInteger(value.iterations) &&
    value.iterations > 0
  );
}
