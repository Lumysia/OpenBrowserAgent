import { useEffect, useState } from "react";
import { formatCount, type Messages } from "../../src/shared/i18n";
import { stringifyHeaders } from "../../src/shared/mcp";
import { mcpOriginRulesSupported } from "../../src/shared/mcp-origin-rules";
import type { McpServerConfig } from "../../src/shared/types";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTriggerButton,
  CardDescription,
  CardTitle,
  InfoTip,
  Input,
  Label,
  SettingSwitch,
  Switch,
  Textarea,
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
        <Input
          value={server.name}
          onChange={(event) => onUpdate({ name: event.currentTarget.value })}
        />
      </Label>
      <Label>
        {t.options.mcpServerDescription}
        <Textarea
          value={server.description || ""}
          onChange={(event) =>
            onUpdate({ description: event.currentTarget.value })
          }
        />
      </Label>
      <Label>
        {t.options.mcpServerUrl}
        <Input
          value={server.url}
          placeholder={t.options.mcpServerUrlPlaceholder}
          onChange={(event) =>
            onUpdate({ url: event.currentTarget.value, ...untestedPatch() })
          }
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
            <div className="setting-switch-row compact" key={tool.name}>
              <div>
                <CardTitle className="settings-section-title">
                  {tool.name}
                </CardTitle>
                {tool.description && (
                  <CardDescription>{tool.description}</CardDescription>
                )}
              </div>
              <Switch
                checked={tool.enabled}
                onCheckedChange={(enabled) =>
                  onChange(
                    tools.map((item) =>
                      item.name === tool.name ? { ...item, enabled } : item,
                    ),
                  )
                }
              />
            </div>
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
  const [draft, setDraft] = useState(() => stringifyHeaders(value));

  useEffect(() => setDraft(stringifyHeaders(value)), [value]);

  return (
    <Label>
      {label}
      <Textarea
        value={draft}
        placeholder={'{\n  "Authorization": "Bearer ..."\n}'}
        onChange={(event) => {
          const next = event.currentTarget.value;
          setDraft(next);
          onChange(next);
        }}
      />
    </Label>
  );
}
