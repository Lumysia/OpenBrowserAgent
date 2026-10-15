import { useState } from "react";
import { Plus } from "lucide-react";
import {
  ADD_PROVIDER_TYPES,
  type ProviderId,
} from "../../src/shared/providers";
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
import { ProviderAccordion } from "./provider-accordion";
import { useProviders } from "./use-providers";

// The AI providers: add one, and edit each in its own row.
export function ProviderList() {
  const t = useMessages();
  const { providers, addProvider, updateProvider, deleteProvider, modelAdded } =
    useProviders();
  const [providerType, setProviderType] = useState<ProviderId>("openai");
  const [openProviders, setOpenProviders] = useState<string[]>([]);

  if (!providers) return null;

  function add() {
    const providerId = addProvider(providerType);
    setOpenProviders((items) =>
      items.includes(providerId) ? items : [providerId, ...items],
    );
  }

  return (
    <div className="stack">
      <div className="provider-add-row">
        <ProviderTypeSelect value={providerType} onChange={setProviderType} />
        <Button onClick={add}>
          <Plus size={16} /> {t.sidepanel.addProvider}
        </Button>
      </div>
      <Accordion
        type="multiple"
        value={openProviders}
        onValueChange={setOpenProviders}
        className="stack"
      >
        {Object.entries(providers).map(([providerId, provider]) => (
          <ProviderAccordion
            key={providerId}
            providerId={providerId}
            value={provider}
            onChange={(next) => updateProvider(providerId, next)}
            onDelete={() => deleteProvider(providerId)}
            onModelAdded={(model) => modelAdded(model)}
          />
        ))}
      </Accordion>
    </div>
  );
}

// The kinds of AI provider that can be added. `placeholder` shows while
// none is chosen.
export function ProviderTypeSelect({
  value,
  placeholder,
  onChange,
}: {
  value: ProviderId | undefined;
  placeholder?: string;
  onChange: (type: ProviderId) => void;
}) {
  const t = useMessages();
  return (
    <Select
      value={value ?? ""}
      onValueChange={(next) => onChange(next as ProviderId)}
    >
      <SelectTrigger aria-label={t.options.providers}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {ADD_PROVIDER_TYPES.map((type) => (
          <SelectItem key={type} value={type}>
            {providerTypeLabel(type, t)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
