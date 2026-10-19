import { getBrowserApi } from "../../shared/browser-api";
import { storage } from "../../shared/storage";

// This device's id among the devices that run tasks. It is its own id, not
// the sync device id (which a copied profile changes), so the tasks a
// device owns stay its own.

const SEEN_REFRESH_MS = 24 * 60 * 60_000;

const OS_NAMES: Record<string, string> = {
  mac: "macOS",
  win: "Windows",
  linux: "Linux",
  cros: "ChromeOS",
  android: "Android",
  openbsd: "OpenBSD",
  fuchsia: "Fuchsia",
};

// The system and a short part of the id, which tells two computers with
// the same system apart.
async function defaultName(id: string) {
  const platform = await Promise.resolve()
    .then(() => getBrowserApi().runtime.getPlatformInfo())
    .catch(() => undefined);
  const os = (platform && OS_NAMES[platform.os]) || platform?.os;
  return [os, id.slice(0, 4).toUpperCase()].filter(Boolean).join(" · ");
}

// Gives this device an id when it has none and lists it among the task
// devices (its last-seen time refreshed once a day). Returns the id.
export async function ensureTaskDevice(now = Date.now()) {
  let id = await storage.taskDeviceId.get();
  if (!id) {
    id = crypto.randomUUID();
    await storage.taskDeviceId.set(id);
  }
  const deviceId = id;
  const devices = await storage.taskDevices.get();
  const listed = devices.find((device) => device.id === deviceId);
  if (!listed) {
    const name = await defaultName(deviceId);
    await storage.taskDevices.update((items) => [
      ...items.filter((device) => device.id !== deviceId),
      { id: deviceId, name, seenAt: now },
    ]);
  } else if (now - listed.seenAt > SEEN_REFRESH_MS)
    await storage.taskDevices.update((items) =>
      items.map((device) =>
        device.id === deviceId ? { ...device, seenAt: now } : device,
      ),
    );
  return deviceId;
}
