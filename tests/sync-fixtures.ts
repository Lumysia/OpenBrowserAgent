import {
  DEFAULT_SYNC_DATA_SETTINGS,
  STORAGE_KEYS,
} from "../src/shared/storage-keys";
import type { SyncDataSettings } from "../src/shared/storage-keys";
import { gunzip, gzip, sha256Hex } from "../src/shared/sync/codec";
import { runSyncRound, type RoundReason } from "../src/shared/sync/engine";
import type {
  AttachmentStore,
  StorageArea,
  StoredAttachment,
  SyncEnv,
} from "../src/shared/sync/env";
import { decodeRoot, encodeRoot } from "../src/shared/sync/root";
import { loadSyncState, markDirty } from "../src/shared/sync/state";
import {
  BlobIntegrityError,
  type Transport,
} from "../src/shared/sync/transport";

// In-memory stand-ins for one device's storage and for a server that keeps
// a root with ETags (compare-and-swap) and blobs.

export function memoryArea(): StorageArea & { data: Record<string, unknown> } {
  const data: Record<string, unknown> = {};
  return {
    data,
    async get(keys) {
      if (keys === null) return structuredClone(data);
      const list = Array.isArray(keys) ? keys : [keys];
      return structuredClone(
        Object.fromEntries(
          list.filter((key) => key in data).map((key) => [key, data[key]]),
        ),
      );
    },
    async set(items) {
      Object.assign(data, structuredClone(items));
    },
    async remove(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key];
    },
  };
}

export function memoryAttachments(): AttachmentStore & {
  data: Map<string, StoredAttachment>;
} {
  const data = new Map<string, StoredAttachment>();
  return {
    data,
    get: async (id) => structuredClone(data.get(id)),
    put: async (record) => void data.set(record.id, structuredClone(record)),
    delete: async (id) => void data.delete(id),
  };
}

export type MemoryServer = {
  root?: Uint8Array;
  etag?: string;
  version: number;
  blobs: Map<string, Uint8Array>;
  requests: string[];
};

export const memoryServer = (): MemoryServer => ({
  version: 0,
  blobs: new Map(),
  requests: [],
});

export function memoryTransport(
  server: MemoryServer,
  hooks: {
    // Runs before a root write is checked (to slip in another device's write).
    beforeWrite?: () => Promise<void>;
    ignoreIfMatch?: boolean;
  } = {},
): Transport {
  return {
    kind: "webdav",
    async readRoot(etag) {
      server.requests.push("GET root");
      if (!server.root) return { status: "missing" };
      if (etag && etag === server.etag) return { status: "unchanged" };
      return {
        status: "ok",
        root: await decodeRoot(server.root),
        etag: server.etag,
      };
    },
    async writeRoot(root, etag) {
      server.requests.push("PUT root");
      const hook = hooks.beforeWrite;
      hooks.beforeWrite = undefined;
      await hook?.();
      if (!hooks.ignoreIfMatch && (etag ? etag !== server.etag : !!server.root))
        return { status: "conflict" };
      server.root = await encodeRoot(root);
      server.etag = `"v${++server.version}"`;
      return { status: "ok", etag: server.etag };
    },
    async getBlob(hash) {
      server.requests.push("GET blob");
      const stored = server.blobs.get(hash);
      if (!stored) return undefined;
      const payload = await gunzip(stored);
      if ((await sha256Hex(payload)) !== hash)
        throw new BlobIntegrityError(hash);
      return payload;
    },
    async putBlob(hash, payload) {
      server.requests.push("PUT blob");
      server.blobs.set(hash, await gzip(payload));
    },
    async deleteBlob(hash) {
      server.requests.push("DELETE blob");
      server.blobs.delete(hash);
    },
    listBlobs: async () =>
      [...server.blobs.keys()].map((hash) => ({ hash, modifiedAt: 1 })),
    async clear() {
      server.root = undefined;
      server.etag = undefined;
      server.blobs.clear();
    },
    check: async () => ({ strongEtags: true, honoursPreconditions: true }),
  };
}

export function testEnv(clock: { now: number }): SyncEnv & {
  local: ReturnType<typeof memoryArea>;
  attachments: ReturnType<typeof memoryAttachments>;
} {
  const queues = new Map<string, Promise<unknown>>();
  return {
    local: memoryArea(),
    sync: memoryArea(),
    attachments: memoryAttachments(),
    fetch: globalThis.fetch,
    now: () => clock.now,
    lock(name, run) {
      const next = (queues.get(name) ?? Promise.resolve())
        .catch(() => undefined)
        .then(run);
      queues.set(name, next);
      return next;
    },
  };
}

export type Device = ReturnType<typeof device>;

// A device: its storage, a transport to `server`, and helpers that edit
// local data the way the app does (the background marks the key dirty).
export function device(
  name: string,
  transport: Transport,
  clock: { now: number },
  settings: Partial<SyncDataSettings> = {},
) {
  const env = testEnv(clock);
  const context = {
    env,
    transport,
    scope: "test",
    device: name,
    settings: { ...DEFAULT_SYNC_DATA_SETTINGS, ...settings },
  };
  return {
    name,
    env,
    context,
    async set(key: string, value: unknown) {
      await env.local.set({ [key]: value });
      await markDirty(env, [key]);
    },
    async remove(key: string) {
      await env.local.remove(key);
      await markDirty(env, [key]);
    },
    get: <T = unknown>(key: string) => env.local.data[key] as T,
    sync: (reason: RoundReason = "poll", options = {}) =>
      runSyncRound(context, reason, options),
    state: () => loadSyncState(env.local, "test"),
  };
}

export const ALL_ON: Partial<SyncDataSettings> = {
  syncProviders: true,
  syncAgents: true,
  syncSkills: true,
  syncMcpServers: true,
  syncLocalExecutionBridges: true,
  syncChats: true,
  syncChatAttachments: true,
};

export function chat(
  id: string,
  messages: Array<[string, number]>,
  extra = {},
) {
  return {
    summary: {
      id,
      title: id,
      createdAt: 1,
      updatedAt: 1,
      messageCount: messages.length,
      ...extra,
    },
    content: {
      messages: messages.map(([messageId, createdAt]) => ({
        id: messageId,
        role: "user",
        content: messageId,
        createdAt,
      })),
    },
  };
}

// Saves a chat the way the side panel does: its summary, then its content.
export async function saveChat(
  on: Device,
  id: string,
  messages: Array<[string, number]>,
) {
  const { summary, content } = chat(id, messages);
  const list = (on.get<Array<{ id: string }>>(STORAGE_KEYS.chats) ?? []).filter(
    (item) => item.id !== id,
  );
  await on.set(STORAGE_KEYS.chats, [...list, summary]);
  await on.set(`${STORAGE_KEYS.chats}/${id}`, content);
}

export const messageIds = (on: Device, id: string) =>
  (
    on.get<{ messages: Array<{ id: string }> }>(`${STORAGE_KEYS.chats}/${id}`)
      ?.messages ?? []
  ).map((message) => message.id);

// A transport whose calls can be intercepted once (to run another device's
// or another job's work in the middle of a request).
export function hookedTransport(base: Transport) {
  const hooks: Partial<Record<keyof Transport, () => Promise<void>>> = {};
  const once = (name: keyof Transport) => {
    const hook = hooks[name];
    delete hooks[name];
    return hook?.();
  };
  const transport: Transport = {
    ...base,
    async readRoot(etag) {
      await once("readRoot");
      return base.readRoot(etag);
    },
    async writeRoot(root, etag) {
      await once("writeRoot");
      return base.writeRoot(root, etag);
    },
    async getBlob(hash) {
      await once("getBlob");
      return base.getBlob(hash);
    },
    async deleteBlob(hash) {
      await once("deleteBlob");
      return base.deleteBlob(hash);
    },
  };
  return { transport, hooks };
}
