import { DEFAULT_PREFERENCES } from "../../src/shared/default-preferences";
import { chooseChatModel } from "../../src/shared/model-choice";
import { modelChoiceLabel } from "../../src/shared/model-display";
import type { Agent, Preferences, ProviderState } from "../../src/shared/types";

// The model a chat message runs with, chosen as the background chooses it,
// so the label names the model that answers.
export function chatModelLabel(
  agent: Agent,
  providers: ProviderState | undefined,
  preferences: Preferences | undefined,
) {
  const settings = preferences ?? DEFAULT_PREFERENCES;
  const choice = chooseChatModel(
    providers ?? {},
    settings,
    agent.modelId,
    settings.selectedModelId,
  );
  return choice && modelChoiceLabel(choice);
}
