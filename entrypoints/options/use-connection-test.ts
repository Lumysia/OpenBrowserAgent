import { useEffect, useState } from "react";
import {
  listProviderModels,
  testProviderModel,
} from "../../src/shared/provider-requests";
import { canonicalJson } from "../../src/shared/sync/codec";
import type { ModelConfig, ProviderConfig } from "../../src/shared/types";
import { errorWithDetail } from "../../src/shared/user-errors";
import { useMessages } from "../../src/ui/messages";

// Where "Test connection" stands. `failed` says which part failed: reaching
// the provider and listing its models (`list`), or the model answering.
export type ConnectionTestResult =
  | { state: "idle" }
  | { state: "testing" }
  | { state: "ok"; message: string }
  | { state: "noModels"; message: string }
  | { state: "failed"; stage: "list" | "model"; message: string };

// "Test connection" in setup, on the same requests as the provider editor's
// "Fetch models" and "Test": without a model yet, list the provider's models
// and pick the first; then ask the model for an answer. `chooseModel` puts a
// model on the provider and returns it as stored. A changed kind, address,
// key or permission starts over.
export function useConnectionTest(
  providerId: string,
  draft: ProviderConfig,
  chooseModel: (model: ModelConfig) => ModelConfig,
) {
  const t = useMessages();
  const s = t.setup;
  const [result, setResult] = useState<ConnectionTestResult>({
    state: "idle",
  });
  const [listed, setListed] = useState<ModelConfig[]>([]);
  const target = canonicalJson([
    draft.type,
    draft.baseUrl,
    draft.apiKey,
    draft.consent?.host,
  ]);

  useEffect(() => {
    setResult({ state: "idle" });
  }, [target]);

  // `typed`: a model name the user entered, tested instead of a listed one.
  async function run(typed?: string) {
    setResult({ state: "testing" });
    let model = typed
      ? chooseModel({ id: `${providerId}:${typed}`, name: typed })
      : draft.models?.[0];
    if (!model) {
      let models: ModelConfig[];
      try {
        models = await listProviderModels(providerId, draft);
      } catch (error) {
        setResult({
          state: "failed",
          stage: "list",
          message: errorWithDetail(s.connectionFailed, error, t),
        });
        return;
      }
      setListed(models);
      if (!models.length) {
        setResult({ state: "noModels", message: s.noModelsListed });
        return;
      }
      model = chooseModel(models[0]);
    }
    const name = model.name || model.id;
    try {
      await testProviderModel(providerId, { ...draft, models: [model] }, name);
      setResult({
        state: "ok",
        message: s.connectionOk.replace("{model}", name),
      });
    } catch (error) {
      setResult({
        state: "failed",
        stage: "model",
        message: errorWithDetail(
          s.modelFailed.replace("{model}", name),
          error,
          t,
        ),
      });
    }
  }

  return {
    result,
    listed,
    run: (typed?: string) => void run(typed),
    reset: () => setResult({ state: "idle" }),
  };
}
