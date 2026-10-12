import {
  canonicalJson,
  gunzip,
  gzip,
  sha256Hex,
  bytesText,
  jsonBytes,
} from "./codec";
import type { StorageArea } from "./env";
import { bytesToBase64, base64ToBytes } from "../binary";
import { GARBAGE_GRACE_MS } from "./blobs";
import { emptyRoot, validateRoot, type SyncRecord } from "./root";
import { BlobIntegrityError, SyncHttpError, type Transport } from "./transport";

// The browser account's sync storage holds the same records as WebDAV, one
// item per record (`r:<id>`). Content that does not fit an item (a large
// record, a blob) is stored gzip+base64 in parts (`p:<hash>` holds the part
// count and when they were written, `p:<hash>:<n>` the parts). The browser merges items last-writer-
// wins and reports changes through storage.onChanged, so nothing polls.

export const BROWSER_SYNC_LIMITS = {
  totalBytes: 102_400,
  itemBytes: 8_192,
  items: 512,
  // Base64 characters per part, below the item limit with key and quotes.
  partChars: 7_800,
} as const;

const RECORD = "r:";
const PART = "p:";

type Items = Record<string, unknown>;
type RecordRef = { clock: string; ref: string };
type PartsHeader = { parts: number; at: number };

// Parts no record refers to yet are kept this long: another device's write
// may still be arriving. Older ones are left by a write that never landed.
const UNREFERENCED_PARTS_MS = GARBAGE_GRACE_MS;

export class SyncQuotaError extends Error {}

// Records whose parts have not all arrived yet: try again on the next change.
export class SyncNotReadyError extends Error {}

const itemSize = (key: string, value: unknown) =>
  new TextEncoder().encode(key).length +
  new TextEncoder().encode(JSON.stringify(value)).length;

async function partsOf(
  hash: string,
  payload: Uint8Array,
  at: number,
): Promise<Items> {
  const encoded = bytesToBase64(await gzip(payload));
  const items: Items = {};
  let count = 0;
  for (
    let offset = 0;
    offset < encoded.length || count === 0;
    offset += BROWSER_SYNC_LIMITS.partChars
  )
    items[`${PART}${hash}:${count++}`] = encoded.slice(
      offset,
      offset + BROWSER_SYNC_LIMITS.partChars,
    );
  items[`${PART}${hash}`] = { parts: count, at } satisfies PartsHeader;
  return items;
}

async function readParts(items: Items, hash: string) {
  const count = (items[`${PART}${hash}`] as Partial<PartsHeader> | undefined)
    ?.parts;
  if (typeof count !== "number") return undefined;
  let encoded = "";
  for (let index = 0; index < count; index++) {
    const part = items[`${PART}${hash}:${index}`];
    if (typeof part !== "string") return undefined;
    encoded += part;
  }
  const payload = await gunzip(base64ToBytes(encoded)).catch(() => undefined);
  if (!payload || (await sha256Hex(payload)) !== hash)
    throw new BlobIntegrityError(`Sync content ${hash} is damaged.`);
  return payload;
}

export function createBrowserSyncTransport(
  area: StorageArea,
  now: () => number = Date.now,
): Transport {
  // Records as stored items: inline when they fit, else a part reference.
  async function recordItems(records: Record<string, SyncRecord>) {
    const items: Items = {};
    for (const [id, record] of Object.entries(records)) {
      const key = `${RECORD}${id}`;
      if (itemSize(key, record) <= BROWSER_SYNC_LIMITS.itemBytes) {
        items[key] = record;
        continue;
      }
      const payload = jsonBytes(record);
      const hash = await sha256Hex(payload);
      items[key] = { clock: record.clock, ref: hash } satisfies RecordRef;
      Object.assign(items, await partsOf(hash, payload, now()));
    }
    return items;
  }

  async function readAll() {
    return (await area.get(null)) as Items;
  }

  return {
    kind: "browser-sync",
    async readRoot(etag) {
      const items = await readAll();
      const records: Record<string, SyncRecord> = {};
      for (const [key, value] of Object.entries(items)) {
        if (!key.startsWith(RECORD)) continue;
        const ref = value as Partial<RecordRef>;
        if (typeof ref?.ref !== "string") {
          records[key.slice(RECORD.length)] = value as SyncRecord;
          continue;
        }
        const payload = await readParts(items, ref.ref);
        if (!payload)
          throw new SyncNotReadyError("Synced items still arriving.");
        records[key.slice(RECORD.length)] = JSON.parse(bytesText(payload));
      }
      const root = validateRoot({ ...emptyRoot(), records });
      const version = await sha256Hex(
        new TextEncoder().encode(canonicalJson(records)),
      );
      if (etag === version) return { status: "unchanged" };
      return Object.keys(records).length
        ? { status: "ok", root, etag: version }
        : { status: "missing" };
    },
    async writeRoot(root) {
      const current = await readAll();
      const next = await recordItems(root.records);
      // Parts already stored keep their header (content-addressed, so they
      // are the same), so unchanged records cost no writes.
      for (const key of Object.keys(next))
        if (key.startsWith(PART) && !key.slice(PART.length).includes(":"))
          next[key] = current[key] ?? next[key];
      // Parts go once the records that referred to them stop doing so. Parts
      // no stored record names yet may belong to another device's write
      // still arriving, so they stay for a day.
      const referenced = partHashes(next);
      for (const record of Object.values(root.records))
        if (record.blob) referenced.add(record.blob);
      const replaced = partHashes(current);
      const keep = (key: string) => {
        if (key in next || key.startsWith(RECORD)) return key in next;
        if (!key.startsWith(PART)) return false;
        const hash = key.slice(PART.length).split(":")[0];
        if (referenced.has(hash)) return true;
        if (replaced.has(hash)) return false;
        const header = current[`${PART}${hash}`] as
          Partial<PartsHeader> | undefined;
        return (
          typeof header?.at !== "number" ||
          now() - header.at < UNREFERENCED_PARTS_MS
        );
      };
      const proposed: Items = {};
      for (const [key, value] of Object.entries(current))
        if (keep(key)) proposed[key] = value;
      Object.assign(proposed, next);
      checkQuota(proposed);
      const changed = Object.fromEntries(
        Object.entries(next).filter(
          ([key, value]) =>
            canonicalJson(current[key]) !== canonicalJson(value),
        ),
      );
      // Everything else in this area is this extension's, including items an
      // older version stored; what the records no longer need goes.
      const stale = Object.keys(current).filter((key) => !keep(key));
      await guard(async () => {
        if (Object.keys(changed).length) await area.set(changed);
        if (stale.length) await area.remove(stale);
      });
      return {
        status: "ok",
        etag: await sha256Hex(
          new TextEncoder().encode(canonicalJson(root.records)),
        ),
      };
    },
    async getBlob(hash) {
      return readParts(await readAll(), hash);
    },
    async putBlob(hash, payload) {
      const parts = await partsOf(hash, payload, now());
      const current = await readAll();
      checkQuota({ ...current, ...parts });
      await guard(() => area.set(parts));
    },
    async deleteBlob(hash) {
      const keys = Object.keys(await readAll()).filter(
        (key) => key === `${PART}${hash}` || key.startsWith(`${PART}${hash}:`),
      );
      if (keys.length) await area.remove(keys);
    },
    // Unreferenced parts are removed with every root write.
    listBlobs: async () => [],
    async clear() {
      const keys = Object.keys(await readAll());
      if (keys.length) await area.remove(keys);
    },
    check: async () => ({ strongEtags: true, honoursPreconditions: true }),
  };
}

// Hashes of the parts that stored records use (blobs and large records).
function partHashes(items: Items) {
  const hashes = new Set<string>();
  for (const [key, value] of Object.entries(items)) {
    if (!key.startsWith(RECORD) || !value || typeof value !== "object")
      continue;
    const record = value as Partial<SyncRecord & RecordRef>;
    if (typeof record.blob === "string") hashes.add(record.blob);
    if (typeof record.ref === "string") hashes.add(record.ref);
  }
  return hashes;
}

function checkQuota(items: Items) {
  let total = 0;
  for (const [key, value] of Object.entries(items)) {
    const size = itemSize(key, value);
    if (size > BROWSER_SYNC_LIMITS.itemBytes)
      throw new SyncQuotaError(`Sync item ${key} is ${size} bytes.`);
    total += size;
  }
  if (total > BROWSER_SYNC_LIMITS.totalBytes)
    throw new SyncQuotaError(
      `Browser sync storage would hold ${total} bytes; its limit is ${BROWSER_SYNC_LIMITS.totalBytes}.`,
    );
  if (Object.keys(items).length > BROWSER_SYNC_LIMITS.items)
    throw new SyncQuotaError(
      `Browser sync storage would hold ${Object.keys(items).length} items; its limit is ${BROWSER_SYNC_LIMITS.items}.`,
    );
}

// The browser's write-rate quotas surface as errors; they pause sync like a
// server's 429.
async function guard(write: () => Promise<void>) {
  try {
    await write();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/MAX_WRITE_OPERATIONS/i.test(message))
      throw new SyncHttpError(message, 429, 60_000);
    if (/QUOTA_BYTES/i.test(message)) throw new SyncQuotaError(message);
    throw error;
  }
}
