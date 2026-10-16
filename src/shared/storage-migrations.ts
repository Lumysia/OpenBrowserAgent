import { getBrowserApi } from "./browser-api";
import { normalizeMcpServers } from "./mcp";
import { mcpServerFromPreset, MCP_SERVER_PRESETS } from "./mcp-presets";
import { chooseChatModel, chooseImageModel } from "./model-choice";
import { storage } from "./storage";
import { STORAGE_KEYS } from "./storage-keys";

// Changes to stored data that an update makes once on each device, in
// order. A new install starts in the current form, so it only records them
// as done. Each step must be safe to run again (a step that failed is run
// on the next update) and must keep data newer versions wrote. Shapes that
// are still read as they are (normalizers) need no step here.
type Migration = {
  id: string;
  // The release whose data needs it.
  until: string;
  run: () => Promise<void>;
};

const REMOVED_USER_ID_KEY = "userId";
const REMOVED_DEBUG_LOGGING_KEY = "debug-logging-enabled";

// The "Enable image generation" switch, removed: the Images model choice is
// the switch now. Switched on without a choice (or one no longer
// configured), images used the chat's model, so that model becomes the
// choice; switched off, a choice is
// cleared, as image generation was off.
async function imageModelIsTheSwitch() {
  const providers = await storage.provider.get();
  await storage.preferences.update((current) => {
    const { imageGenerationEnabled: enabled, ...preferences } =
      current as typeof current & { imageGenerationEnabled?: unknown };
    if (enabled === undefined) return current;
    return {
      ...preferences,
      selectedImageModelId:
        enabled === true
          ? (
              chooseImageModel(providers, preferences) ??
              chooseChatModel(providers, preferences)
            )?.model.id
          : undefined,
    };
  });
}

const MIGRATIONS: readonly Migration[] = [
  {
    // Up to this release every MCP server list showed the preset servers
    // without storing them, and they could not be deleted. They are stored
    // now, so the list keeps them and the user can delete them; servers
    // removed later are offered as presets instead.
    id: "store-mcp-presets",
    until: "0.2.0-beta.8",
    run: () =>
      storage.mcpServers
        .update((servers) => {
          const ids = new Set(servers.map((server) => server.id));
          const missing = MCP_SERVER_PRESETS.filter(
            (item) => !ids.has(item.id),
          ).map((item) => mcpServerFromPreset(item, 0));
          return missing.length
            ? normalizeMcpServers([...missing, ...servers])
            : servers;
        })
        .then(() => undefined),
  },
  {
    // A key no version reads or writes.
    id: "remove-user-id",
    until: "0.2.0-beta.8",
    run: () => getBrowserApi().storage.local.remove(REMOVED_USER_ID_KEY),
  },
  {
    // The "Diagnostic logging" switch, removed: nothing logged with it.
    id: "remove-debug-logging",
    until: "0.2.0-beta.9",
    run: () => getBrowserApi().storage.local.remove(REMOVED_DEBUG_LOGGING_KEY),
  },
  {
    // The side panel waits for the guided setup on a new install; a device
    // that used an earlier release has been set up already.
    id: "setup-done-before-guided-setup",
    until: "0.2.0-beta.12",
    run: () => storage.setupDone.set(true),
  },
  {
    id: "image-model-is-the-switch",
    until: "0.2.0-beta.16",
    run: imageModelIsTheSwitch,
  },
];

export async function runStorageMigrations(fresh: boolean) {
  const local = getBrowserApi().storage.local;
  const key = STORAGE_KEYS.storageMigrations;
  const done = new Set(
    ((await local.get(key))[key] as string[] | undefined) ?? [],
  );
  for (const migration of MIGRATIONS) {
    if (done.has(migration.id)) continue;
    if (!fresh) await migration.run();
    done.add(migration.id);
    await local.set({ [key]: [...done] });
  }
}
