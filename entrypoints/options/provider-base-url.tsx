import type { Messages } from "../../src/shared/i18n";
import {
  providerBaseUrlOptions,
  providerType,
} from "../../src/shared/providers";
import type { ProviderConfig } from "../../src/shared/types";
import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../src/ui/components";

// A provider's base URL: a choice among the service's own URLs (regions),
// or a free text field with the type's default as its placeholder.
export function ProviderBaseUrl({
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
