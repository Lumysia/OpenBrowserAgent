import { formatCount, type Messages } from "../../src/shared/i18n";
import { stringifyHeaders } from "../../src/shared/mcp";
import { mcpOriginRulesSupported } from "../../src/shared/mcp-origin-rules";
import type { McpServerConfig } from "../../src/shared/types";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTriggerButton,
  CardTitle,
  CommitInput,
  CommitTextarea,
  InfoTip,
  Label,
  SettingSwitch,
} from "../../src/ui/components";

// The editable fields of one MCP server and its discovered tools.
export function McpServerFields({
  t,
  server,
  onUpdate,
  onHeadersChange,
}: {
  t: Messages;
  server: McpServerConfig;
  onUpdate: (patch: Partial<McpServerConfig>) => void;
  onHeadersChange: (value: string) => void;
}) {
  return (
    <>
      <Label>
        {t.options.mcpServerName}
        <CommitInput
          value={server.name}
          onCommit={(name) => onUpdate({ name })}
        />
      </Label>
      <Label>
        {t.options.mcpServerDescription}
        <CommitTextarea
          value={server.description || ""}
          onCommit={(description) => onUpdate({ description })}
        />
      </Label>
      <Label>
        {t.options.mcpServerUrl}
        <CommitInput
          value={server.url}
          placeholder={t.options.mcpServerUrlPlaceholder}
          onCommit={(url) => onUpdate({ url: url.trim(), ...untestedPatch() })}
        />
      </Label>
      <McpHeadersField
        label={t.options.mcpServerHeaders}
        value={server.headers}
        onChange={onHeadersChange}
      />
      <SettingSwitch
        variant="field"
        title={t.options.mcpOmitOrigin}
        info={
          <InfoTip label={t.common.moreInfo}>
            {t.options.mcpOmitOriginHint}
          </InfoTip>
        }
        description={
          mcpOriginRulesSupported()
            ? undefined
            : t.options.mcpOmitOriginUnsupported
        }
        checked={server.omitOrigin}
        onChange={(omitOrigin) => onUpdate({ omitOrigin, ...untestedPatch() })}
      />
      {!!server.tools?.length && (
        <McpToolList
          t={t}
          tools={server.tools}
          onChange={(tools) => onUpdate({ tools })}
        />
      )}
    </>
  );
}

function McpToolList({
  t,
  tools,
  onChange,
}: {
  t: Messages;
  tools: NonNullable<McpServerConfig["tools"]>;
  onChange: (tools: NonNullable<McpServerConfig["tools"]>) => void;
}) {
  return (
    <Accordion type="single" collapsible className="settings-nested-accordion">
      <AccordionItem value="tools">
        <AccordionTriggerButton>
          <span className="settings-summary">
            <CardTitle className="settings-section-title">
              {t.options.mcpTools}
            </CardTitle>
            <small>{formatCount(t.options.mcpTestSuccess, tools.length)}</small>
          </span>
        </AccordionTriggerButton>
        <AccordionContent className="stack">
          {tools.map((tool) => (
            <SettingSwitch
              key={tool.name}
              variant="field"
              title={tool.name}
              description={tool.description}
              checked={tool.enabled}
              onChange={(enabled) =>
                onChange(
                  tools.map((item) =>
                    item.name === tool.name ? { ...item, enabled } : item,
                  ),
                )
              }
            />
          ))}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

// A change to how the server is reached needs a new test before use.
export function untestedPatch() {
  return {
    enabled: false,
    tools: [],
    testedAt: undefined,
    lastTestError: "",
  } satisfies Partial<McpServerConfig>;
}

function McpHeadersField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Record<string, string> | undefined;
  onChange: (value: string) => void;
}) {
  return (
    <Label>
      {label}
      <CommitTextarea
        value={stringifyHeaders(value)}
        placeholder={'{\n  "Authorization": "Bearer …"\n}'}
        onCommit={onChange}
      />
    </Label>
  );
}
