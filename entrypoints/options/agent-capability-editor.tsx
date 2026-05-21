import { SlidersHorizontal } from "lucide-react";
import { AGENT_CAPABILITY_GROUPS } from "../../src/shared/agents";
import type { Messages } from "../../src/shared/i18n";
import type { AgentCapabilities } from "../../src/shared/types";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Label,
  Switch,
} from "../../src/ui/components";

export function AgentCapabilityEditor({
  t,
  capabilities,
  onChange,
}: {
  t: Messages;
  capabilities: AgentCapabilities;
  onChange: (capabilities: AgentCapabilities) => void;
}) {
  return (
    <Accordion type="single" collapsible className="agent-capability-accordion">
      <AccordionItem value="capabilities">
        <AccordionTrigger>
          <span className="agent-summary">
            <span className="agent-summary-title">
              <SlidersHorizontal size={15} />
              <span>{t.options.agentCapabilities}</span>
            </span>
            <small>{t.options.agentCapabilitiesDescription}</small>
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <div className="agent-capability-groups">
            {AGENT_CAPABILITY_GROUPS.map((group) => (
              <div className="agent-capability-group" key={group.key}>
                <h3>{t.options.agentCapabilityGroups[group.key]}</h3>
                <div className="agent-capability-grid">
                  {group.capabilities.map((key) => (
                    <div className="agent-capability-row" key={key}>
                      <Label
                        className="agent-capability-label"
                        htmlFor={`agent-capability-${key}`}
                      >
                        {t.options.agentCapabilityLabels[key]}
                      </Label>
                      <Switch
                        id={`agent-capability-${key}`}
                        checked={capabilities[key]}
                        onCheckedChange={(checked) =>
                          onChange({ ...capabilities, [key]: checked })
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
