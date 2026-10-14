import type { SyncCapabilities } from "../sync-backends";
import { SyncFormatError, type Root } from "./root";

// Where records are stored: a WebDAV folder, or the browser account's sync
// storage. The engine talks to both through this interface.

export type RootRead =
  | { status: "unchanged" }
  | { status: "missing" }
  | { status: "ok"; root: Root; etag?: string }
  // The root cannot be read (an interrupted upload left it empty or cut
  // off, or it is in an older format): the next write replaces it, from
  // `previous` (the root it replaced, if that copy is good) and local data.
  | {
      status: "damaged";
      reason: "unreadable" | "older-format";
      etag?: string;
      previous?: Root;
    };

export type RootWriteOptions = {
  // The good root being replaced, kept as a copy until the write is done.
  previous?: Root;
  // Replace a damaged root that has no validator.
  replace?: boolean;
};

export type RootWrite =
  | { status: "ok"; etag?: string }
  // Another write got there first (a stale If-Match).
  | { status: "conflict" }
  // Another client is still writing the file; nothing changed yet.
  | { status: "busy" };

export type StoredBlob = { hash: string; modifiedAt: number };

export type ServerCheck = {
  // The server sends strong ETags, so root writes can be compare-and-swap.
  strongEtags: boolean;
  // A write with a stale If-Match was refused (412).
  honoursPreconditions: boolean;
};

export type Transport = {
  capabilities: SyncCapabilities;
  // Conditional when `etag` is given; "unchanged" means it still matches.
  readRoot(etag?: string): Promise<RootRead>;
  // Replace the root only if it is still `etag` (undefined: still missing,
  // unless `replace`). Either refusal: read again and retry.
  writeRoot(
    root: Root,
    etag: string | undefined,
    options?: RootWriteOptions,
  ): Promise<RootWrite>;
  // A blob's payload, checked against its hash; undefined when missing.
  getBlob(hash: string): Promise<Uint8Array | undefined>;
  hasBlob(hash: string): Promise<boolean>;
  putBlob(hash: string, payload: Uint8Array): Promise<void>;
  deleteBlob(hash: string): Promise<void>;
  listBlobs(): Promise<StoredBlob[]>;
  // Remove everything this extension stored.
  clear(): Promise<void>;
  check(): Promise<ServerCheck>;
};

// An HTTP failure; 429 and 503 pause all sync (see the scheduler).
export class SyncHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}

export class BlobIntegrityError extends Error {}

// How a root that could not be decoded is read: a newer format stops sync,
// anything else is a damaged root the next write replaces.
export function damagedRoot(
  error: unknown,
  etag: string | undefined,
  previous?: Root,
): RootRead {
  if (!(error instanceof SyncFormatError) || error.newerFormat) throw error;
  return {
    status: "damaged",
    reason: error.olderFormat ? "older-format" : "unreadable",
    etag,
    previous,
  };
}

const RETRY_AFTER_MIN_MS = 1_000;
const RETRY_AFTER_MAX_MS = 60 * 60_000;

// Retry-After as seconds or an HTTP date, kept between 1 s and 1 h.
export function parseRetryAfter(value: string | null, now = Date.now()) {
  if (!value) return undefined;
  const seconds = /^\s*\d+\s*$/.test(value) ? Number(value) * 1000 : undefined;
  const date = seconds === undefined ? Date.parse(value) - now : undefined;
  const ms = seconds ?? date;
  if (ms === undefined || !Number.isFinite(ms)) return undefined;
  return Math.min(RETRY_AFTER_MAX_MS, Math.max(RETRY_AFTER_MIN_MS, ms));
}

export const isRateLimit = (error: unknown): error is SyncHttpError =>
  error instanceof SyncHttpError &&
  (error.status === 429 || error.status === 503);
