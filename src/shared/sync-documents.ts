import type { SyncBackendConfig } from "./types";
import {
  mergeTinyBaseSyncValue,
  readLocalTinyBaseSyncValue,
  removeLocalTinyBaseSyncDocument,
  sameBytes,
  writeTinyBaseSyncValue,
  type SyncDocCodec,
} from "./sync-tinybase-doc";

// A stored document as last seen on the backend. `decoded` is the merged
// local value for exactly these bytes, so an unchanged document is not decoded
// again.
export type RemoteDocument = {
  data: Uint8Array;
  etag?: string;
  lastModified?: string;
  decoded?: { value: unknown; rev: string };
};

// Raw document storage of one backend. Names are `<key>` or `<key>/<item>`.
export type DocumentTransport = {
  config: SyncBackendConfig;
  // Conditional where the backend supports it; an unchanged document is
  // returned as the same cached object.
  get(name: string, fresh?: boolean): Promise<RemoteDocument | undefined>;
  // The last seen document without a request, if the transport caches one.
  peek(name: string): RemoteDocument | undefined;
  // Write only if the document is still `previous` (absent: still missing).
  put(
    name: string,
    bytes: Uint8Array,
    previous: RemoteDocument | undefined,
  ): Promise<RemoteDocument | "conflict">;
  remove(name: string): Promise<void>;
  // Remove every `<key>/...` document.
  removeFolder(key: string): Promise<void>;
  test(): Promise<void>;
};

export type DocumentValue<T> = { value: T | undefined; rev?: string };

const MAX_WRITE_ATTEMPTS = 3;

export function documentScope(config: SyncBackendConfig, name: string) {
  const scope =
    config.type === "webdav"
      ? `${config.type}:${config.username || ""}:${config.url}`
      : config.id;
  return `${scope}:${name}`;
}

export async function readDocument<T>(
  transport: DocumentTransport,
  name: string,
  codec: SyncDocCodec<T>,
): Promise<DocumentValue<T>> {
  const scope = documentScope(transport.config, name);
  const remote = await transport.get(name);
  if (!remote) {
    await removeLocalTinyBaseSyncDocument(scope);
    return { value: undefined };
  }
  if (remote.decoded) return remote.decoded as DocumentValue<T>;
  const result = await mergeTinyBaseSyncValue(scope, remote.data, codec);
  remote.decoded = { value: result.value, rev: result.remoteRev };
  return remote.decoded as DocumentValue<T>;
}

// The local replica's value without a request, preferring the decoded copy of
// the last seen remote document.
export async function readLocalDocument<T>(
  transport: DocumentTransport,
  name: string,
  codec: SyncDocCodec<T>,
) {
  const decoded = transport.peek(name)?.decoded;
  if (decoded) return { value: decoded.value as T | undefined };
  return readLocalTinyBaseSyncValue(
    documentScope(transport.config, name),
    codec,
  );
}

export async function writeDocument<T>(
  transport: DocumentTransport,
  name: string,
  value: T,
  codec: SyncDocCodec<T>,
  // Skip the cached copy, which may be stale (e.g. cloud data was cleared).
  fresh = false,
): Promise<DocumentValue<T> & { rev: string; created: boolean }> {
  const scope = documentScope(transport.config, name);
  // A cached document is written optimistically; a conflict fetches the
  // current one and merges it.
  let remote =
    (!fresh && transport.peek(name)) || (await transport.get(name, fresh));
  if (remote) delete remote.decoded;
  // Stamp the user's changes once. Conflict retries only merge CRDT state.
  let result = await writeTinyBaseSyncValue(scope, value, remote?.data, codec);
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
    const stored =
      remote && sameBytes(remote.data, result.bytes)
        ? remote
        : await transport.put(name, result.bytes, remote);
    if (stored !== "conflict") {
      stored.decoded = { value: result.value, rev: result.rev };
      // `created`: the document did not exist (e.g. cloud data was cleared).
      return { value: result.value, rev: result.rev, created: !remote };
    }
    if (attempt + 1 === MAX_WRITE_ATTEMPTS) break;
    remote = await transport.get(name, true);
    if (remote)
      result = await mergeTinyBaseSyncValue(scope, remote.data, codec);
  }
  throw new Error("Sync write conflict retries exhausted.");
}

export async function removeDocument(
  transport: DocumentTransport,
  name: string,
) {
  await transport.remove(name);
  await removeLocalTinyBaseSyncDocument(documentScope(transport.config, name));
}
