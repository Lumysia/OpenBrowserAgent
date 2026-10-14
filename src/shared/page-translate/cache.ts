// Translations saved on this device (IndexedDB in the extension's origin),
// keyed by a hash of what produced them and the source text. The page keeps
// its own in-memory copy for the session; this one makes pages translated
// before come back at once, also after a restart.
import { idbStore } from "../idb-store";

export const TRANSLATION_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// Oldest entries go beyond this many.
const MAX_ENTRIES = 50_000;

type Entry = { key: string; text: string; at: number };

const request = idbStore({
  database: "page-translations",
  store: "translations",
  keyPath: "key",
  indexes: { at: "at" },
});

// `engine`: the engine's cacheKey (engine, model, prompt version).
export async function translationCacheKey(
  engine: string,
  target: string,
  text: string,
) {
  const bytes = new TextEncoder().encode(
    `${engine}\u0000${target}\u0000${text}`,
  );
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function readTranslations(keys: string[]) {
  const found = new Map<string, string>();
  if (!keys.length) return found;
  const cutoff = Date.now() - TRANSLATION_CACHE_TTL_MS;
  await request("readonly", (objects) => {
    for (const key of keys) {
      const get = objects.get(key);
      get.onsuccess = () => {
        const entry = get.result as Entry | undefined;
        if (entry && entry.at > cutoff) found.set(key, entry.text);
      };
    }
  });
  return found;
}

export async function writeTranslations(entries: Map<string, string>) {
  if (!entries.size) return;
  const at = Date.now();
  await request("readwrite", (objects) => {
    for (const [key, text] of entries) objects.put({ key, text, at });
  });
}

// Drops expired entries and the oldest beyond the cap.
export async function pruneTranslations() {
  const cutoff = Date.now() - TRANSLATION_CACHE_TTL_MS;
  await request("readwrite", (objects) => {
    const index = objects.index("at");
    const expired = index.openCursor(IDBKeyRange.upperBound(cutoff));
    expired.onsuccess = () => {
      const cursor = expired.result;
      if (!cursor) return;
      cursor.delete();
      cursor.continue();
    };
    const count = objects.count();
    count.onsuccess = () => {
      let extra = count.result - MAX_ENTRIES;
      if (extra <= 0) return;
      const oldest = index.openCursor();
      oldest.onsuccess = () => {
        const cursor = oldest.result;
        if (!cursor || extra-- <= 0) return;
        cursor.delete();
        cursor.continue();
      };
    };
  });
}

export async function clearTranslations() {
  await request("readwrite", (objects) => objects.clear());
}
