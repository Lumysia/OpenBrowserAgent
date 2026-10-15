import type { Messages } from "../../src/shared/i18n";
import {
  providerApiStyles,
  providerBaseUrlPlacement,
  type ProviderId,
} from "../../src/shared/providers";
import { hasThinkingSwitch } from "../../src/shared/thinking-switch";
import type { ProviderConfig } from "../../src/shared/types";
import {
  Disclosure,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../src/ui/components";
import { providerTypeLabel } from "../../src/ui/provider-display";
import { ProviderBaseUrl } from "./provider-base-url";
import { ProviderThinkingSwitch } from "./provider-thinking-switch";

// What few people change about a provider: its API style, a named service's
// base URL and the thinking switch. Nothing to show: no disclosure.
export function ProviderAdvanced({
  t,
  value,
  onChange,
}: {
  t: Messages;
  value: ProviderConfig;
  onChange: (value: ProviderConfig) => void;
}) {
  const provider = value.type || "openai";
  const styles = providerApiStyles(provider);
  const baseUrlHere = providerBaseUrlPlacement(provider) === "advanced";
  const fields = [
    styles.length > 0 && (
      <Label key="style">
        {t.options.apiStyle}
        <Select
          value={provider}
          onValueChange={(type) =>
            onChange({ ...value, type: type as ProviderId })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {styles.map((style) => (
              <SelectItem key={style} value={style}>
                {providerTypeLabel(style, t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <small className="muted">{t.options.apiStyleHint}</small>
      </Label>
    ),
    baseUrlHere && (
      <ProviderBaseUrl key="url" t={t} value={value} onChange={onChange} />
    ),
    <ProviderThinkingSwitch
      key="thinking"
      t={t}
      provider={provider}
      value={value}
      onChange={onChange}
    />,
  ];
  if (!styles.length && !baseUrlHere && !hasThinkingSwitch(provider))
    return null;
  return <Disclosure label={t.options.advanced}>{fields}</Disclosure>;
}
