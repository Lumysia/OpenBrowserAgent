import { configuredModels } from "./model-choice";
import { storage } from "./storage";
import type { ProviderState } from "./types";

// The side panel opens once setup is finished: the guided setup reached its
// last step on this device, or a model is there to chat with (added in
// settings, or arrived through sync). Until then, whatever would open the
// panel opens the setup instead.
export function isSetupFinished(
  setupDone: boolean | undefined,
  providers: ProviderState | undefined,
) {
  return !!setupDone || configuredModels(providers).length > 0;
}

export async function readSetupFinished() {
  const [setupDone, providers] = await Promise.all([
    storage.setupDone.get(),
    storage.provider.get(),
  ]);
  return isSetupFinished(setupDone, providers);
}

// Calls `callback` with whether setup is finished, whenever that may have
// changed.
export function watchSetupFinished(callback: (finished: boolean) => void) {
  const changed = () => {
    readSetupFinished().then(callback).catch(console.warn);
  };
  const stops = [
    storage.setupDone.watch(changed),
    storage.provider.watch(changed),
  ];
  return () => stops.forEach((stop) => stop());
}
