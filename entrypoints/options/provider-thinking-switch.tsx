import type { Messages } from "../../src/shared/i18n";
import {
  hasThinkingSwitch,
  providerThinkingSwitch,
  THINKING_SWITCH_OPTIONS,
  type ThinkingSwitch,
} from "../../src/shared/thinking-switch";
import type { ProviderConfig, ProviderId } from "../../src/shared/types";
import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../src/ui/components";

function optionLabel(t: Messages, value: ThinkingSwitch) {
  return {
    auto: t.options.thinkingSwitchAuto,
    chatTemplate: t.options.thinkingSwitchChatTemplate,
    reasoningEffort: t.options.thinkingSwitchReasoningEffort,
    none: t.options.thinkingSwitchNone,
  }[value];
}

// How quick tasks ask this provider's models to skip thinking, for provider
// types that take any OpenAI-compatible server.
export function ProviderThinkingSwitch({
  t,
  provider,
  value,
  onChange,
}: {
  t: Messages;
  provider: ProviderId;
  value: ProviderConfig;
  onChange: (value: ProviderConfig) => void;
}) {
  if (!hasThinkingSwitch(provider)) return null;
  return (
    <>
      <Label>
        {t.options.thinkingSwitch}
        <Select
          value={providerThinkingSwitch(provider, value)}
          onValueChange={(thinkingSwitch) =>
            onChange({
              ...value,
              thinkingSwitch: thinkingSwitch as ThinkingSwitch,
            })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {THINKING_SWITCH_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {optionLabel(t, option)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Label>
      <p className="muted">{t.options.thinkingSwitchHint}</p>
    </>
  );
}
