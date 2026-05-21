import {
  AGENT_ICON_IDS,
  DEFAULT_AGENT_ICON_ID,
  type AgentIconId,
} from "../../src/shared/agent-icon-registry";
import type { Messages } from "../../src/shared/i18n";
import { Label, ToggleGroup, ToggleGroupItem } from "../../src/ui/components";
import { AgentIcon } from "../../src/ui/agent-icons";

export function AgentIconPicker({
  t,
  value,
  onChange,
}: {
  t: Messages;
  value?: AgentIconId;
  onChange: (value: AgentIconId) => void;
}) {
  return (
    <Label>
      {t.options.agentIcon}
      <ToggleGroup
        type="single"
        className="agent-icon-picker"
        value={value || DEFAULT_AGENT_ICON_ID}
        onValueChange={(nextValue) =>
          nextValue && onChange(nextValue as AgentIconId)
        }
      >
        {AGENT_ICON_IDS.map((icon) => (
          <ToggleGroupItem
            aria-label={t.options.agentIconLabels[icon]}
            key={icon}
            title={t.options.agentIconLabels[icon]}
            value={icon}
          >
            <AgentIcon icon={icon} size={17} />
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </Label>
  );
}
