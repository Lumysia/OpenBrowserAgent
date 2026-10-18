import { useMemo } from "react";
import {
  createProviderConfig,
  normalizeProviderState,
} from "../../src/shared/provider-instances";
import type { ProviderId } from "../../src/shared/providers";
import { storage } from "../../src/shared/storage";
import type { ModelConfig, ProviderConfig } from "../../src/shared/types";
import { useStoredState } from "../../src/ui/useStoredState";

// The stored AI providers and what settings do with them: add, edit and
// delete one, and make the first model added the chat model. The same on
// the AI providers page and in setup. `providers` is undefined while
// storage loads.
export function useProviders() {
  const [providerState, setProviderState] = useStoredState(storage.provider);
  const [, setPreferences] = useStoredState(storage.preferences);
  const providers = useMemo(
    () => providerState && normalizeProviderState(providerState),
    [providerState],
  );

  // A new provider of `type`, stored first in the list; returns its id.
  function addProvider(type: ProviderId) {
    const provider = createProviderConfig(type, providers || {});
    const providerId = provider.id!;
    setProviderState((previous) => ({ [providerId]: provider, ...previous }));
    return providerId;
  }

  // A form saving its last edit as it closes leaves a deleted provider
  // deleted.
  function updateProvider(providerId: string, next: ProviderConfig) {
    setProviderState((previous) =>
      previous[providerId] ? { ...previous, [providerId]: next } : previous,
    );
  }

  // Deleting a provider unsets the models picked from it (see
  // forgetRemovedModels).
  function deleteProvider(providerId: string) {
    setProviderState((previous) => {
      const { [providerId]: _removed, ...next } = previous;
      return next;
    });
  }

  // The first model added becomes the chat model; the other features use
  // the chat's model until another is picked. `replaced`: models it takes
  // the place of, whose choice moves to it.
  function modelAdded(model: ModelConfig, replaced: ModelConfig[] = []) {
    setPreferences((previous) => ({
      ...previous,
      selectedModelId:
        !previous.selectedModelId ||
        replaced.some((old) => old.id === previous.selectedModelId)
          ? model.id
          : previous.selectedModelId,
    }));
  }

  return {
    providers,
    addProvider,
    updateProvider,
    deleteProvider,
    modelAdded,
  };
}
