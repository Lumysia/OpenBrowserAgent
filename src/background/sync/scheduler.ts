import { getBrowserApi } from "../../shared/browser-api";
import { STORAGE_KEYS } from "../../shared/storage-keys";
import {
  isSyncRequest,
  registerSyncHandler,
  SYNC_MESSAGE,
  type SyncRequest,
  type SyncResponse,
} from "../../shared/sync/client";
import {
  pruneSyncStates,
  loadSyncStatus,
  SYNC_WARNINGS,
  updateSyncStatus,
} from "../../shared/sync/state";
import {
  recordLocalChanges,
  type StorageChanges,
} from "../../shared/sync/track";
import {
  browserSyncEnv,
  checkBackend,
  countPending,
  resetSync,
  createSyncRunner,
  loadContent,
  syncContext,
  syncDeviceId,
  type RoundRequest,
} from "./service";
import {
  getActiveSyncBackendConfig,
  getStoredSyncBackends,
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

  // Local edits get their clocks (with sync off too, so turning it on
  // later knows what changed when); a round follows.
  async function recordEdits(changes: StorageChanges) {
    const recorded = await recordLocalChanges(
      env,
      await syncDeviceId(env),
      changes,
    );
    if (!recorded) return;
    const context = await syncContext(env);
    if (!context) return;
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
        return loadContent(
          await syncContext(env),
          message.collection,
          message.id,
        );
      case SYNC_MESSAGE.resolveDeletes: {
        // Prompts of both kinds at once are answered one by one; the round
        // runs once every one has its answer.
        const asked = ((await loadSyncStatus(env.local)).massDelete ?? []).map(
          (entry) =>
            !!entry.local === !!message.local
              ? { ...entry, keep: !message.apply }
              : entry,
        );
        const open = asked.some((entry) => entry.keep === undefined);
        await updateSyncStatus(env.local, {
          massDelete: open ? asked : undefined,
        });
        if (open) return loadSyncStatus(env.local);
        await request({
          reason: "manual",
          massDelete: [true, false].map((keep) => ({
            collections: asked
              .filter((entry) => entry.keep === keep)
              .map((entry) => entry.collection),
            keep,
          })),
        });
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
        await resetSync(
          env,
          await syncContext(env),
          message.remote,
          message.keys,
        );
        return request({ reason: "manual" });
    }
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
    void recordEdits(changes).catch((error) =>
      console.warn("Recording local changes failed", error),
    );
    if (
      changes[STORAGE_KEYS.activeSyncBackendId] ||
      changes[STORAGE_KEYS.syncBackends]
    ) {
      verifying = verifying.then(verifyServer).catch(() => undefined);
      void forgetRemovedBackends();
      void updatePolling();
      void request({ reason: "startup" });
    }
  });

  // States of backends no longer configured are dropped.
  async function forgetRemovedBackends() {
    const backends = await getStoredSyncBackends();
    await pruneSyncStates(env.local, backends.map(syncBackendScope));
  }

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

  api.alarms?.onAlarm.addListener(async (alarm) => {
    if (alarm.name === ALARMS.poll) {
      await updatePolling();
      if ((await visiblePages()) > 0) void request({ reason: "poll" });
    } else if (alarm.name === ALARMS.edit) void request({ reason: "edit" });
    else if (alarm.name === ALARMS.resume) void request({ reason: "poll" });
  });

  api.runtime.onStartup?.addListener(() => void request({ reason: "startup" }));
}
