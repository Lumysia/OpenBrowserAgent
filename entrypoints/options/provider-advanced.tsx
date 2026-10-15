import type { Messages } from "../../src/shared/i18n";
import {
  providerApiStyles,
  providerBaseUrlOptions,
  providerType,
  type ProviderId,
} from "../../src/shared/providers";
import { hasThinkingSwitch } from "../../src/shared/thinking-switch";
import type { ProviderConfig } from "../../src/shared/types";
import {
  Disclosure,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../src/ui/components";
import { providerTypeLabel } from "../../src/ui/provider-display";
import { ProviderThinkingSwitch } from "./provider-thinking-switch";

// What few people change about a provider: its API style, base URL and
// thinking switch. Nothing to show: no disclosure.
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
    <ProviderBaseUrl key="url" t={t} value={value} onChange={onChange} />,
    <ProviderThinkingSwitch
      key="thinking"
      t={t}
      provider={provider}
      value={value}
      onChange={onChange}
    />,
  ];
  if (!styles.length && !hasBaseUrl(provider) && !hasThinkingSwitch(provider))
    return null;
  return <Disclosure label={t.options.advanced}>{fields}</Disclosure>;
}

const hasBaseUrl = (provider: ProviderId) =>
  !providerType(provider).sdkEndpoint ||
  providerBaseUrlOptions(provider).length > 0;

function ProviderBaseUrl({
  t,
  value,
  onChange,
}: {
  t: Messages;
  value: ProviderConfig;
  onChange: (value: ProviderConfig) => void;
}) {
  const provider = value.type || "openai";
  const options = providerBaseUrlOptions(provider);
  if (options.length) {
    return (
      <Label>
        {t.options.baseUrl}
        <Select
          value={value.baseUrl || options[0]}
          onValueChange={(baseUrl) => onChange({ ...value, baseUrl })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((url) => (
              <SelectItem key={url} value={url}>
                {url}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Label>
    );
  }
  // The Gemini SDK has its own endpoint.
  if (providerType(provider).sdkEndpoint) return null;
  return (
    <Label>
      {t.options.baseUrl}
      <Input
        value={value.baseUrl || ""}
        placeholder={providerType(provider).defaultBaseUrl}
        onChange={(event) =>
          onChange({ ...value, baseUrl: event.target.value })
        }
      />
    </Label>
  );
}
