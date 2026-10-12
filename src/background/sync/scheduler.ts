import { getBrowserApi } from "../../shared/browser-api";
import { storageLockName } from "../../shared/locks";
import {
  mergeSyncDataSettings,
  STORAGE_KEYS,
  type SyncDataSettings,
} from "../../shared/storage-keys";
import {
  isSyncRequest,
  registerSyncHandler,
  SYNC_MESSAGE,
  type SyncRequest,
  type SyncResponse,
} from "../../shared/sync/client";
import { ownsKey } from "../../shared/sync/collection";
import { SYNC_COLLECTIONS } from "../../shared/sync/collections";
import {
  loadDirty,
  loadSyncState,
  loadSyncStatus,
  saveSyncState,
  SYNC_WARNINGS,
  updateSyncStatus,
} from "../../shared/sync/state";
import {
  browserSyncEnv,
  checkBackend,
  countPending,
  resetSync,
  createSyncRunner,
  loadContent,
  syncContext,
  type RoundRequest,
} from "./service";
import {
  getActiveSyncBackendConfig,
  SYNC_BACKEND_TYPES,
  syncBackendScope,
} from "../../shared/sync-backends";
import type { ServerCheck } from "../../shared/sync/transport";

// When sync runs. All triggers live here in the background:
// - browser start, and an extension page opening or getting focus (at most
//   every OPEN_CHECK_MIN_MS);
// - EDIT_DEBOUNCE_MS after a local edit;
// - every minute while an extension page is visible (chrome.alarms);
// - WebDAV only: nothing while no extension page is visible; browser sync
//   learns of other devices' changes from storage.onChanged instead.

const ALARMS = {
  poll: "sync-poll",
  edit: "sync-edit",
  resume: "sync-resume",
} as const;
const POLL_PERIOD_MINUTES = 1;
const EDIT_DEBOUNCE_MS = 8_000;
const REMOTE_DEBOUNCE_MS = 2_000;
const OPEN_CHECK_MIN_MS = 15_000;
const PAGES_KEY = STORAGE_KEYS.syncVisiblePages;
const RECENT_CHECK_MS = 60_000;

type PageStates = Record<string, { visible: boolean; at: number }>;

export function setupSync() {
  const api = getBrowserApi();
  const env = browserSyncEnv();
  const runner = createSyncRunner(env, (until) =>
    api.alarms?.create(ALARMS.resume, { when: until }),
  );
  const session = api.storage.session ?? api.storage.local;
  let editTimer: ReturnType<typeof setTimeout> | undefined;
  // Backend changes arrive as several storage events; checks run in order.
  let verifying = Promise.resolve();
  let lastCheck: { scope: string; at: number; result: ServerCheck } | undefined;
  let remoteTimer: ReturnType<typeof setTimeout> | undefined;

  const request = (next: RoundRequest) =>
    runner.request(next).catch((error) => console.warn("Sync failed", error));

  function scheduleEdit() {
    clearTimeout(editTimer);
    editTimer = setTimeout(
      () => void request({ reason: "edit" }),
      EDIT_DEBOUNCE_MS,
    );
    // Backup if the worker stops before the timer fires.
    api.alarms?.create(ALARMS.edit, {
      when: Date.now() + EDIT_DEBOUNCE_MS * 4,
    });
  }

  async function markDirty(keys: string[]) {
    const owned = keys.filter((key) =>
      SYNC_COLLECTIONS.some((collection) => ownsKey(collection, key)),
    );
    if (!owned.length) return;
    const added = await env.lock(
      storageLockName(STORAGE_KEYS.syncDirty),
      async () => {
        const dirty = await loadDirty(env.local);
        const fresh = owned.filter((key) => dirty[key] === undefined);
        if (!fresh.length) return false;
        const now = env.now();
        for (const key of fresh) dirty[key] = now;
        await env.local.set({ [STORAGE_KEYS.syncDirty]: dirty });
        return true;
      },
    );
    const context = added ? await syncContext(env) : undefined;
    if (context)
      await updateSyncStatus(env.local, {
        pendingCount: await countPending(env, context),
      });
    scheduleEdit();
  }

  async function visiblePages() {
    // A background page (Firefox, Safari) sees the pages themselves.
    const views = api.extension?.getViews?.();
    if (views && !api.runtime.getContexts)
      return views.filter((view) => view.document.visibilityState === "visible")
        .length;
    const pages = ((await session.get(PAGES_KEY))[PAGES_KEY] ??
      {}) as PageStates;
    if (api.runtime.getContexts) {
      const alive = new Set(
        (await api.runtime.getContexts({})).map(
          (context) => context.documentId,
        ),
      );
      for (const id of Object.keys(pages)) if (!alive.has(id)) delete pages[id];
      await session.set({ [PAGES_KEY]: pages });
    }
    return Object.values(pages).filter((page) => page.visible).length;
  }

  async function updatePolling() {
    const backend = await getActiveSyncBackendConfig();
    const poll =
      backend?.type === SYNC_BACKEND_TYPES.webDav && (await visiblePages()) > 0;
    if (!poll) return api.alarms?.clear(ALARMS.poll);
    const existing = await api.alarms?.get(ALARMS.poll);
    if (!existing)
      api.alarms?.create(ALARMS.poll, { periodInMinutes: POLL_PERIOD_MINUTES });
  }

  async function pageState(
    message: Extract<SyncRequest, { type: typeof SYNC_MESSAGE.page }>,
    documentId: string | undefined,
  ) {
    if (documentId) {
      const pages = ((await session.get(PAGES_KEY))[PAGES_KEY] ??
        {}) as PageStates;
      pages[documentId] = { visible: message.visible, at: Date.now() };
      await session.set({ [PAGES_KEY]: pages });
    }
    await updatePolling();
    if (!message.visible) return;
    const status = await loadSyncStatus(env.local);
    if (Date.now() - (status.lastCheckAt ?? 0) >= OPEN_CHECK_MIN_MS)
      void request({ reason: "open" });
  }

  async function handle(message: SyncRequest, documentId?: string) {
    switch (message.type) {
      case SYNC_MESSAGE.page:
        return pageState(message, documentId);
      case SYNC_MESSAGE.now:
        await request({ reason: "manual" });
        return loadSyncStatus(env.local);
      case SYNC_MESSAGE.load:
        return loadContent(env, message.collection, message.id);
      case SYNC_MESSAGE.resolveDeletes: {
        const collections =
          (await loadSyncStatus(env.local)).massDelete?.map(
            (entry) => entry.collection,
          ) ?? [];
        await updateSyncStatus(env.local, { massDelete: undefined });
        if (message.apply)
          await request({ reason: "manual", allowMassDelete: true });
        else await keepLocalCopies(collections);
        return loadSyncStatus(env.local);
      }
      case SYNC_MESSAGE.check: {
        const result = await checkBackend(env, message.backend);
        lastCheck = {
          scope: syncBackendScope(message.backend),
          at: Date.now(),
          result,
        };
        return result;
      }
      case SYNC_MESSAGE.reset:
        await runner.idle();
        await resetSync(env, message.remote, message.keys);
        return request({ reason: "manual" });
    }
  }

  // The user keeps what the remote deletions would remove: this device's
  // copies of those collections count as new edits, newer than the deletes.
  async function keepLocalCopies(collections: string[]) {
    const context = await syncContext(env);
    if (!context) return;
    const state = await loadSyncState(env.local, context.scope);
    for (const [recordId, entry] of Object.entries(state.synced))
      if (collections.includes(recordId.slice(0, recordId.indexOf("/"))))
        state.synced[recordId] = { ...entry, dataHash: undefined };
    state.rescan = [...new Set([...state.rescan, ...collections])];
    await saveSyncState(env.local, state);
    await request({ reason: "manual" });
  }

  registerSyncHandler((message) => handle(message));

  api.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!isSyncRequest(message)) return false;
    handle(message, sender.documentId)
      .then((value) => sendResponse({ ok: true, value } satisfies SyncResponse))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        } satisfies SyncResponse),
      );
    return true;
  });

  api.storage.onChanged.addListener((changes, area) => {
    if (area === "sync") {
      clearTimeout(remoteTimer);
      remoteTimer = setTimeout(async () => {
        const backend = await getActiveSyncBackendConfig();
        if (backend?.type === SYNC_BACKEND_TYPES.browserSync)
          void request({ reason: "remote" });
      }, REMOTE_DEBOUNCE_MS);
      return;
    }
    if (area !== "local") return;
    void markDirty(Object.keys(changes));
    if (
      changes[STORAGE_KEYS.activeSyncBackendId] ||
      changes[STORAGE_KEYS.syncBackends]
    ) {
      verifying = verifying.then(verifyServer).catch(() => undefined);
      void updatePolling();
      void request({ reason: "startup" });
    }
    const settings = changes[STORAGE_KEYS.syncDataSettings];
    if (settings)
      void followEnabledCategories(settings.oldValue, settings.newValue);
  });

  // A new backend: check what safe writes need, once.
  async function verifyServer() {
    await updateSyncStatus(env.local, {
      warnings: [],
      error: undefined,
      massDelete: undefined,
      pausedUntil: undefined,
      backoffLevel: undefined,
    });
    const context = await syncContext(env);
    if (!context) return;
    // The setup flow has just checked this server.
    const recent =
      lastCheck?.scope === context.scope &&
      Date.now() - lastCheck.at < RECENT_CHECK_MS;
    const check = recent
      ? lastCheck!.result
      : await context.transport.check().catch(() => undefined);
    if (!check) return;
    const warnings = [
      ...(check.strongEtags ? [] : [SYNC_WARNINGS.unreliableEtags]),
      ...(check.honoursPreconditions
        ? []
        : [SYNC_WARNINGS.ignoresPreconditions]),
    ];
    if (warnings.length) await updateSyncStatus(env.local, { warnings });
  }

  // A data category turned on: its local data is compared in full next round.
  async function followEnabledCategories(before: unknown, after: unknown) {
    const old = mergeSyncDataSettings(before as Partial<SyncDataSettings>);
    const next = mergeSyncDataSettings(after as Partial<SyncDataSettings>);
    const enabled = SYNC_COLLECTIONS.filter((collection) => {
      const gate = collection.gate;
      if (gate === "always") return false;
      const key = gate === "attachments" ? "syncChatAttachments" : gate;
      return !old[key] && next[key];
    });
    if (!enabled.length) return;
    await markDirty(
      enabled.flatMap((collection) =>
        collection.keys.filter((key) => !key.endsWith("/")),
      ),
    );
  }

  api.alarms?.onAlarm.addListener(async (alarm) => {
    if (alarm.name === ALARMS.poll) {
      await updatePolling();
      if ((await visiblePages()) > 0) void request({ reason: "poll" });
    } else if (alarm.name === ALARMS.edit) void request({ reason: "edit" });
    else if (alarm.name === ALARMS.resume) void request({ reason: "poll" });
  });

  api.runtime.onStartup?.addListener(() => void request({ reason: "startup" }));
}
