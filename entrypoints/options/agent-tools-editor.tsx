import { SlidersHorizontal } from "lucide-react";
import {
  DEBUGGER_TOOL_GROUPS,
  TOOL_GROUPS,
  type ToolGroup,
} from "../../src/shared/agents";
import type { Messages } from "../../src/shared/i18n";
import { areCdpAvailable } from "../../src/shared/runtime-capabilities";
import type { Agent } from "../../src/shared/types";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Label,
  Switch,
} from "../../src/ui/components";

// The tool groups an agent may use, plus its private workspace.
export function AgentToolsEditor({
  t,
  agent,
  readOnly = false,
  onChange,
}: {
  t: Messages;
  agent: Agent;
  readOnly?: boolean;
  onChange: (patch: Partial<Agent>) => void;
}) {
  const groups = TOOL_GROUPS.filter(
    (group) => areCdpAvailable() || !DEBUGGER_TOOL_GROUPS.includes(group),
  );
  const toggle = (group: ToolGroup, checked: boolean) =>
    onChange({
      toolGroups: TOOL_GROUPS.filter((item) =>
        item === group ? checked : agent.toolGroups.includes(item),
      ),
    });
  const rows = [
    ...groups.map((group) => ({
      id: group,
      label: t.options.agentToolGroups[group],
      description: t.options.agentToolGroupDescriptions[group],
      checked: agent.toolGroups.includes(group),
      onChange: (checked: boolean) => toggle(group, checked),
    })),
    {
      id: "workspace-files",
      label: t.options.agentWorkspaceToggle,
      description: t.options.agentWorkspaceToggleDescription,
      checked: agent.workspace,
      onChange: (checked: boolean) => onChange({ workspace: checked }),
    },
  ];
  return (
    <Accordion type="single" collapsible className="agent-tools-accordion">
      <AccordionItem value="tools">
        <AccordionTrigger>
          <span className="settings-summary">
            <span className="settings-summary-title">
              <SlidersHorizontal size={15} />
              <span>{t.options.agentTools}</span>
            </span>
            <small>
              {readOnly
                ? t.options.builtinAgentToolsDescription
                : t.options.agentToolsDescription}
            </small>
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <div className="agent-tools-grid">
            {rows.map((row) => (
              <div className="agent-tool-row" key={row.id}>
                <Label
                  className="agent-tool-label"
                  htmlFor={`agent-tool-${row.id}`}
                >
                  {row.label}
                  <small>{row.description}</small>
                </Label>
                <Switch
                  id={`agent-tool-${row.id}`}
                  checked={row.checked}
                  disabled={readOnly}
                  onCheckedChange={row.onChange}
                />
              </div>
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
