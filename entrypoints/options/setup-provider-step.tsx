import { useState } from "react";
import { Loader2, PlugZap } from "lucide-react";
import { providerType, type ProviderId } from "../../src/shared/providers";
import type { ModelConfig, ProviderConfig } from "../../src/shared/types";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  Feedback,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../src/ui/components";
import { useMessages } from "../../src/ui/messages";
import {
  modelNameDisplay,
  providerNameDisplay,
  providerTypeLabel,
} from "../../src/ui/provider-display";
import { SyncJoinDisclosure } from "../../src/ui/sync-join-form";
import { UI_STATE, stateWhen } from "../../src/ui/ui-state";
import { ProviderConnectionFields } from "./provider-connection-fields";
import { modelWithProviderLabel } from "./provider-drafts";
import { ProviderTypeSelect } from "./provider-list";
import { useConnectionTest } from "./use-connection-test";
import { useProviderDraft } from "./use-provider-draft";
import { useProviders } from "./use-providers";

// Setup's AI provider step: pick a kind of provider, fill in how to reach
// it, test the connection and pick a model; or join sync from another
// device. `providerId`: the provider this setup added, edited again when it
// comes back here.
export function SetupProviderStep({
  providerId,
  onProviderId,
}: {
  providerId: string | undefined;
  onProviderId: (providerId: string | undefined) => void;
}) {
  const t = useMessages();
  const s = t.setup;
  const { providers, addProvider, updateProvider, deleteProvider, modelAdded } =
    useProviders();
  if (!providers) return null;
  const own = providerId ? providers[providerId] : undefined;
  // A provider with a model, added here, before, or through sync.
  const ready = Object.values(providers).find(
    (provider) => provider.models?.length,
  );

  // Another kind replaces the provider this setup added.
  function pickType(type: ProviderId) {
    if (own?.type === type) return;
    if (own) deleteProvider(own.id);
    onProviderId(addProvider(type));
  }

  return (
    <div className="stack">
      {ready && (
        <Feedback className="setup-feedback">
          {s.providerReady.replace(
            "{name}",
            ready.label
              ? providerNameDisplay(ready.label, t)
              : providerTypeLabel(ready.type, t),
          )}
        </Feedback>
      )}
      <Card>
        <CardContent className="stack setup-provider-form">
          <ProviderTypeSelect
            value={own?.type}
            placeholder={s.providerPlaceholder}
            onChange={pickType}
          />
          {own && (
            <SetupProviderForm
              key={own.id}
              providerId={own.id}
              value={own}
              onChange={(next) => updateProvider(own.id, next)}
              onModelAdded={modelAdded}
            />
          )}
        </CardContent>
      </Card>
      <SyncJoinDisclosure />
    </div>
  );
}

function SetupProviderForm({
  providerId,
  value,
  onChange,
  onModelAdded,
}: {
  providerId: string;
  value: ProviderConfig;
  onChange: (value: ProviderConfig) => void;
  onModelAdded: (model: ModelConfig, replaced: ModelConfig[]) => void;
}) {
  const t = useMessages();
  const s = t.setup;
  const { draft, setDraft, keyUnsaved } = useProviderDraft(
    providerId,
    value,
    onChange,
  );
  const [typedModel, setTypedModel] = useState("");
  // Setup gives its provider one model: the one picked replaces it.
  function chooseModel(model: ModelConfig) {
    const added = modelWithProviderLabel(model, draft);
    setDraft((current) => ({ ...current, models: [added] }));
    onModelAdded(added, draft.models ?? []);
    return added;
  }
  const test = useConnectionTest(providerId, draft, chooseModel);
  const { result } = test;
  const testing = result.state === "testing";
  const model = draft.models?.[0];
  const canType =
    !!providerType(draft.type).manualModels &&
    (result.state === "noModels" ||
      (result.state === "failed" && result.stage === "list"));

  return (
    <>
      <ProviderConnectionFields
        t={t}
        saved={value}
        draft={draft}
        keyUnsaved={keyUnsaved}
        onDraftChange={setDraft}
      />
      {test.listed.length > 0 && (
        <Label>
          {s.model}
          <Select
            value={model?.id ?? ""}
            onValueChange={(id) => {
              const picked = test.listed.find((item) => item.id === id);
              if (!picked) return;
              chooseModel(picked);
              test.reset();
            }}
          >
            <SelectTrigger aria-label={s.model}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {test.listed.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {modelNameDisplay(item, t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Label>
      )}
      {canType && (
        <Label>
          {s.modelName}
          <Input
            value={typedModel}
            onChange={(event) => setTypedModel(event.target.value)}
          />
          <CardDescription>{s.modelNameHint}</CardDescription>
        </Label>
      )}
      <div className="row">
        <Button
          variant="secondary"
          className="setup-loading-action"
          data-state={stateWhen(testing, UI_STATE.loading)}
          disabled={testing}
          onClick={() =>
            test.run(canType ? typedModel.trim() || undefined : undefined)
          }
        >
          {testing ? (
            <Loader2 size={16} className="spin" />
          ) : (
            <PlugZap size={16} />
          )}
          {testing ? s.testingConnection : s.testConnection}
        </Button>
      </div>
      {(result.state === "ok" ||
        result.state === "failed" ||
        result.state === "noModels") && (
        <Feedback
          key={result.message}
          error={result.state !== "ok"}
          className="setup-feedback"
          data-state={stateWhen(result.state !== "ok", UI_STATE.error)}
        >
          {result.message}
        </Feedback>
      )}
    </>
  );
}
