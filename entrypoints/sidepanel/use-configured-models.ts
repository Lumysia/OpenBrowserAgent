import { useMemo } from "react";
import type { ProviderState } from "../../src/shared/types";

export function useConfiguredModels(
  providers: ProviderState | undefined,
  ignoreSyncedProvidersForBootstrap: boolean | undefined,
) {
  return useMemo(
    () =>
      ignoreSyncedProvidersForBootstrap
        ? []
        : Object.values(providers || {}).flatMap(
            (provider) => provider?.models || [],
          ),
    [ignoreSyncedProvidersForBootstrap, providers],
  );
}
