import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import {
  createProviderConfig,
  normalizeProviderState,
} from "../../src/shared/provider-instances";
import {
  ADD_PROVIDER_TYPES,
  type ProviderId,
} from "../../src/shared/providers";
import { storage } from "../../src/shared/storage";
import type { ModelConfig, ProviderConfig } from "../../src/shared/types";
import {
  Accordion,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../src/ui/components";
import { useMessages } from "../../src/ui/messages";
import { providerTypeLabel } from "../../src/ui/provider-display";
import { useStoredState } from "../../src/ui/useStoredState";
import { ProviderAccordion } from "./provider-accordion";

// The AI providers: add one, and edit each in its own row. The same list on
// the AI providers page and the setup page.
export function ProviderList() {
  const t = useMessages();
  const [providerState, setProviderState] = useStoredState(storage.provider);
  const [, setPreferences] = useStoredState(storage.preferences);
  const [providerType, setProviderType] = useState<ProviderId>("openai");
  const [openProviders, setOpenProviders] = useState<string[]>([]);
  const normalizedProviders = useMemo(
    () => normalizeProviderState(providerState || {}),
    [providerState],
  );

  if (!providerState) return null;

  function updateProvider(providerId: string, next: ProviderConfig) {
    setProviderState((previous) => ({ ...previous, [providerId]: next }));
  }

  function addProvider() {
    const provider = createProviderConfig(providerType, normalizedProviders);
    const providerId = provider.id!;
    setProviderState((previous) => ({ [providerId]: provider, ...previous }));
    setOpenProviders((items) =>
      items.includes(providerId) ? items : [providerId, ...items],
    );
  }

  function deleteProvider(providerId: string) {
    const removed = normalizedProviders[providerId];
    setProviderState((previous) => {
      const { [providerId]: _removed, ...next } = previous;
      return next;
    });
    if (removed?.models?.length)
      setPreferences((previous) =>
        removed.models?.some(
          (model) =>
            model.id === previous.selectedModelId ||
            model.id === previous.selectedImageModelId,
        )
          ? {
              ...previous,
              selectedModelId: undefined,
              selectedImageModelId: undefined,
            }
          : previous,
      );
  }

  // The first model added becomes the chat model.
  function handleModelAdded(model: ModelConfig) {
    setPreferences((previous) => ({
      ...previous,
      selectedModelId: previous.selectedModelId || model.id,
      selectedImageModelId: previous.selectedImageModelId || model.id,
    }));
  }

  return (
    <div className="stack">
      <div className="provider-add-row">
        <Select
          value={providerType}
          onValueChange={(value) => setProviderType(value as ProviderId)}
        >
          <SelectTrigger aria-label={t.options.providers}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ADD_PROVIDER_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {providerTypeLabel(type, t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={addProvider}>
          <Plus size={16} /> {t.sidepanel.addProvider}
        </Button>
      </div>
      <Accordion
        type="multiple"
        value={openProviders}
        onValueChange={setOpenProviders}
        className="stack"
      >
        {Object.entries(normalizedProviders).map(([providerId, provider]) => (
          <ProviderAccordion
            key={providerId}
            providerId={providerId}
            value={provider}
            onChange={(next) => updateProvider(providerId, next)}
            onDelete={() => deleteProvider(providerId)}
            onModelAdded={handleModelAdded}
          />
        ))}
      </Accordion>
    </div>
  );
}
