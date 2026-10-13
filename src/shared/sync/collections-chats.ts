import { storageLockName, withLocks } from "../locks";
import { chatAttachmentIds } from "../chat-attachment-ids";
import { chatContentKey } from "../chat-keys";
import { chatFacts, chatMeta } from "../chats";
import { STORAGE_KEYS, SYNC_PREFERENCES } from "../storage-keys";
import type { ChatContent, ChatSummary } from "../types";
import {
  idOfKey,
  writeHooks,
  type Change,
  type Collection,
  type LocalEntry,
} from "./collection";
import { readKey, type SyncEnv } from "./env";
import { mergeChatBodies } from "./merge-content";

// Chats: the list of summaries is the record data; each chat's content is a
// blob, downloaded only on devices that open that chat.

const CHATS = STORAGE_KEYS.chats;
const contentKey = chatContentKey;

const summariesOf = (value: unknown) =>
  (Array.isArray(value) ? value : []).filter(
    (item): item is ChatSummary =>
      !!item && typeof item === "object" && typeof item.id === "string",
  );

async function readContents(env: SyncEnv, ids: string[]) {
  if (!ids.length) return {};
  return env.local.get(ids.map(contentKey));
}

export const chatsCollection: Collection = {
  name: "chats",
  gate: SYNC_PREFERENCES.chats,
  browserSync: false,
  keys: [CHATS, `${CHATS}/`],
  body: "json",
  lazy: true,
  async read(env, needsBody) {
    const summaries = summariesOf(await readKey(env.local, CHATS));
    const contents = await readContents(
      env,
      summaries.map((chat) => chat.id).filter(needsBody),
    );
    return new Map(
      summaries.map((chat) => [
        chat.id,
        { data: chat, body: contents[contentKey(chat.id)] },
      ]),
    );
  },
  entriesOf(key, value) {
    const id = idOfKey(chatsCollection, key);
    if (id !== undefined)
      return {
        entries: new Map(
          value === undefined ? [] : [[id, { data: undefined, body: value }]],
        ),
        complete: false,
      };
    return {
      entries: new Map(
        summariesOf(value).map((chat) => [chat.id, { data: chat }]),
      ),
      complete: true,
    };
  },
  // Under the locks of the list and of each content key written, the ones
  // the app saves with.
  write(env, changes, hooks) {
    const { verify, commit, step } = writeHooks(env, hooks);
    const locks = [CHATS, ...changes.map((change) => contentKey(change.id))];
    return withLocks(env.lock, locks.map(storageLockName), async () => {
      const removed: string[] = [];
      const written = await step(async () => {
        const summaries = summariesOf(await readKey(env.local, CHATS));
        const contents = await readContents(
          env,
          changes.map((change) => change.id),
        );
        const byId = new Map(summaries.map((chat) => [chat.id, chat]));
        const written = new Set<string>();
        const bodies: Record<string, unknown> = {};
        for (const { id, entry } of changes) {
          const summary = byId.get(id);
          const current = summary
            ? { data: summary, body: contents[contentKey(id)] }
            : undefined;
          if (!(await verify(id, current))) continue;
          written.add(id);
          if (!entry) {
            byId.delete(id);
            removed.push(id);
            continue;
          }
          byId.set(id, entry.data as ChatSummary);
          if (entry.body !== undefined) bodies[contentKey(id)] = entry.body;
        }
        if (!written.size) return written;
        // Unchanged chats keep their place; new ones follow.
        const next = [
          ...summaries
            .filter((chat) => byId.has(chat.id))
            .map((chat) => byId.get(chat.id)!),
          ...[...byId.values()].filter(
            (chat) => !summaries.some((existing) => existing.id === chat.id),
          ),
        ];
        await commit({ [CHATS]: next, ...bodies }, written);
        return written;
      });
      if (removed.length) {
        await env.local.remove(removed.map(contentKey));
        await env.removeChatArtifacts?.(removed).catch(() => undefined);
      }
      return written;
    });
  },
  // A reply still streaming here uploads once it has finished, however long
  // it takes. One whose run died (or ran elsewhere) is not held.
  hold: (id, env) => !!env.runActive?.(id),
  mergeBodies: (base, mine, theirs, newer) =>
    mergeChatBodies(
      base as ChatContent | undefined,
      mine as ChatContent,
      theirs as ChatContent,
      newer,
    ),
  finalizeData(data, body) {
    const content = body as ChatContent;
    return {
      ...chatMeta(data as ChatSummary),
      ...chatFacts(content, [...chatAttachmentIds(content)].sort()),
    };
  },
};

// Chat attachments: an index of metadata in storage (the record data) and
// the bytes in IndexedDB (the blob), downloaded when a chat shows them.
const INDEX = STORAGE_KEYS.chatAttachments;

const indexOf = (value: unknown) =>
  (value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {}) as Record<string, Record<string, unknown>>;

export const attachmentsCollection: Collection = {
  name: "attachments",
  gate: "attachments",
  browserSync: false,
  keys: [INDEX],
  body: "bytes",
  lazy: true,
  async read(env, needsBody) {
    const index = indexOf(await readKey(env.local, INDEX));
    const entries = new Map<string, LocalEntry>();
    for (const [id, data] of Object.entries(index))
      entries.set(id, {
        data,
        body: needsBody(id)
          ? (await env.attachments.get(id))?.content
          : undefined,
      });
    return entries;
  },
  entriesOf: (_key, value) => ({
    entries: new Map(
      Object.entries(indexOf(value)).map(([id, data]) => [id, { data }]),
    ),
    complete: true,
  }),
  write(env, changes: Change[], hooks) {
    const { verify, commit, step } = writeHooks(env, hooks);
    return env.lock(storageLockName(INDEX), () =>
      step(async () => {
        const index = indexOf(await readKey(env.local, INDEX));
        const written = new Set<string>();
        for (const { id, entry } of changes) {
          const current = index[id]
            ? {
                data: index[id],
                body: (await env.attachments.get(id))?.content,
              }
            : undefined;
          if (!(await verify(id, current))) continue;
          written.add(id);
          if (!entry) {
            delete index[id];
            await env.attachments.delete(id);
            continue;
          }
          index[id] = entry.data as Record<string, unknown>;
          if (entry.body instanceof Uint8Array)
            await env.attachments.put({
              id,
              metadata: index[id],
              content: entry.body,
            });
        }
        if (written.size) await commit({ [INDEX]: index }, written);
        return written;
      }),
    );
  },
};
