import { ChevronDown, Plug, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { getMessages } from "../../src/shared/i18n";
import {
  createMcpServerDraft,
  BUILTIN_MCP_SERVERS,
  importMcpServersFromJson,
  isMcpServerTested,
  parseHeadersJson,
  stringifyHeaders,
} from "../../src/shared/mcp";
import { listMcpServerTools } from "../../src/shared/mcp-client";
import { storage } from "../../src/shared/storage";
import type { McpServerConfig } from "../../src/shared/types";
import {
  Accordion,
  AccordionContent,
  AccordionHeader,
  AccordionItem,
  AccordionTriggerButton,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardTitle,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Switch,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../src/ui/components";
import { useStoredState } from "../../src/ui/useStoredState";

export function McpPage() {
  const [language] = useStoredState(storage.language);
  const [servers, setServers] = useStoredState(storage.mcpServers);
  const [importDraft, setImportDraft] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [importMenuOpen, setImportMenuOpen] = useState(false);
  const [testingServerId, setTestingServerId] = useState<string | null>(null);
  const t = getMessages(language);
  const items = servers || [];

  function addServer() {
    setServers((current) => [
      ...current,
      createMcpServerDraft(t.options.newMcpServer),
    ]);
  }

  function updateServer(serverId: string, patch: Partial<McpServerConfig>) {
    setServers((current) =>
      current.map((server) =>
        server.id === serverId
          ? { ...server, ...patch, updatedAt: Date.now() }
          : server,
      ),
    );
  }

  function updateHeaders(serverId: string, value: string) {
    try {
      updateServer(serverId, {
        headers: parseHeadersJson(value),
        ...untestedPatch(),
      });
    } catch {
      // Keep the previous valid headers while the user edits invalid JSON.
    }
  }

  function deleteServer(serverId: string) {
    setServers((current) => current.filter((server) => server.id !== serverId));
  }

  async function testServer(server: McpServerConfig) {
    setTestingServerId(server.id);
    try {
      const tools = await listMcpServerTools(server);
      updateServer(server.id, {
        enabled: true,
        tools: mergeToolSelections(server.tools || [], tools),
        testedAt: Date.now(),
        lastTestError: "",
      });
    } catch (error) {
      updateServer(server.id, {
        enabled: false,
        lastTestError: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setTestingServerId(null);
    }
  }

  function importServers() {
    try {
      const result = importMcpServersFromJson(importDraft);
      if (!result.servers.length) {
        setImportMessage(t.options.mcpImportNone);
        return;
      }
      setServers((current) => [...current, ...result.servers]);
      setImportDraft("");
      setImportMenuOpen(false);
      setImportMessage(
        t.options.mcpImportSuccess.replace(
          "{count}",
          String(result.servers.length),
        ),
      );
    } catch (error) {
      setImportMessage(
        `${t.options.mcpImportError}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  function resetDefaultMcpServers() {
    setServers(cloneDefault(BUILTIN_MCP_SERVERS));
    setImportDraft("");
    setImportMessage("");
    setImportMenuOpen(false);
  }

  return (
    <div className="stack">
      <div className="setting-switch-row">
        <div>
          <h1 className="settings-page-title">
            <Plug size={24} /> {t.options.mcpServers}
          </h1>
          <p className="muted">{t.options.mcpServersDescription}</p>
        </div>
        <div className="button-group">
          <Button onClick={addServer}>
            <Plus size={15} /> {t.options.newMcpServer}
          </Button>
          <Popover open={importMenuOpen} onOpenChange={setImportMenuOpen}>
            <PopoverTrigger asChild>
              <Button size="icon" aria-label={t.options.mcpAdvancedActions}>
                <ChevronDown size={15} />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="settings-popover-content" align="end">
              <div className="settings-popover-menu">
                <CardDescription>{t.options.mcpImportJson}</CardDescription>
                <Textarea
                  className="scrollbar-hidden"
                  value={importDraft}
                  placeholder={
                    '{\n  "mcpServers": {\n    "server": { "url": "https://example.com/mcp" }\n  }\n}'
                  }
                  onChange={(event) =>
                    setImportDraft(event.currentTarget.value)
                  }
                />
                <div className="row">
                  <Button
                    disabled={!importDraft.trim()}
                    onClick={importServers}
                  >
                    <Plus size={15} /> {t.options.mcpImportButton}
                  </Button>
                </div>
                {importMessage && (
                  <CardDescription>{importMessage}</CardDescription>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
      <Accordion type="multiple" className="stack">
        {items.map((server) => (
          <AccordionItem key={server.id} value={server.id}>
            <AccordionHeader className="ui-accordion-header-with-actions">
              <AccordionTriggerButton hideChevron>
                <span className="agent-summary">
                  <span className="agent-summary-title">
                    <Plug size={18} />
                    <span>{server.name || t.options.newMcpServer}</span>
                  </span>
                  <small>
                    {server.description ||
                      server.url ||
                      t.options.mcpServerUrlPlaceholder}
                  </small>
                </span>
              </AccordionTriggerButton>
              <span
                className="accordion-trigger-actions"
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                <Button
                  size="sm"
                  disabled={!server.url || testingServerId === server.id}
                  onClick={() => testServer(server)}
                >
                  {testingServerId === server.id
                    ? t.options.mcpTesting
                    : t.options.mcpTestServer}
                </Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Switch
                      checked={server.enabled && isMcpServerTested(server)}
                      disabled={!isMcpServerTested(server)}
                      onCheckedChange={(enabled) =>
                        updateServer(server.id, { enabled })
                      }
                    />
                  </TooltipTrigger>
                  <TooltipContent>
                    {isMcpServerTested(server)
                      ? t.options.mcpEnableTooltipTested.replace(
                          "{count}",
                          String(server.tools?.length || 0),
                        )
                      : t.options.mcpEnableRequiresTest}
                  </TooltipContent>
                </Tooltip>
              </span>
              <AccordionTriggerButton
                className="accordion-chevron-trigger"
                aria-label={server.name || t.options.newMcpServer}
              />
            </AccordionHeader>
            <AccordionContent>
              <div className="stack">
                <Label>
                  {t.options.mcpServerName}
                  <Input
                    value={server.name}
                    onChange={(event) =>
                      updateServer(server.id, {
                        name: event.currentTarget.value,
                      })
                    }
                  />
                </Label>
                <Label>
                  {t.options.mcpServerDescription}
                  <Textarea
                    value={server.description || ""}
                    onChange={(event) =>
                      updateServer(server.id, {
                        description: event.currentTarget.value,
                      })
                    }
                  />
                </Label>
                <Label>
                  {t.options.mcpServerUrl}
                  <Input
                    value={server.url}
                    placeholder={t.options.mcpServerUrlPlaceholder}
                    onChange={(event) =>
                      updateServer(server.id, {
                        url: event.currentTarget.value,
                        ...untestedPatch(),
                      })
                    }
                  />
                </Label>
                <McpHeadersField
                  label={t.options.mcpServerHeaders}
                  value={server.headers}
                  onChange={(value) => updateHeaders(server.id, value)}
                />
                {!!server.tools?.length && (
                  <Accordion
                    type="single"
                    collapsible
                    className="mcp-tools-accordion"
                  >
                    <AccordionItem value="tools">
                      <AccordionTriggerButton>
                        <span className="agent-summary">
                          <strong>{t.options.mcpTools}</strong>
                          <small>
                            {t.options.mcpTestSuccess.replace(
                              "{count}",
                              String(server.tools.length),
                            )}
                          </small>
                        </span>
                      </AccordionTriggerButton>
                      <AccordionContent className="stack">
                        {server.tools.map((tool) => (
                          <div
                            className="setting-switch-row compact"
                            key={tool.name}
                          >
                            <div>
                              <CardTitle className="settings-section-title">
                                {tool.name}
                              </CardTitle>
                              {tool.description && (
                                <CardDescription>
                                  {tool.description}
                                </CardDescription>
                              )}
                            </div>
                            <Switch
                              checked={tool.enabled}
                              onCheckedChange={(enabled) =>
                                updateServer(server.id, {
                                  tools: (server.tools || []).map((item) =>
                                    item.name === tool.name
                                      ? { ...item, enabled }
                                      : item,
                                  ),
                                })
                              }
                            />
                          </div>
                        ))}
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                )}
                {server.lastTestError && (
                  <CardDescription>{server.lastTestError}</CardDescription>
                )}
                <div className="row">
                  <Button
                    variant="outline"
                    onClick={() => deleteServer(server.id)}
                  >
                    <Trash2 size={15} /> {t.options.deleteMcpServer}
                  </Button>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
      <Card>
        <CardContent>
          <div className="setting-switch-row">
            <div>
              <CardTitle className="settings-section-title">
                <RotateCcw size={18} /> {t.options.resetDefaultMcpServers}
              </CardTitle>
              <CardDescription>
                {t.options.resetDefaultMcpServersDescription}
              </CardDescription>
            </div>
            <Button variant="outline" onClick={resetDefaultMcpServers}>
              {t.options.resetDefaults}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function cloneDefault<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function untestedPatch() {
  return {
    enabled: false,
    tools: [],
    testedAt: undefined,
    lastTestError: "",
  } satisfies Partial<McpServerConfig>;
}

function mergeToolSelections(
  existing: McpServerConfig["tools"],
  next: NonNullable<McpServerConfig["tools"]>,
) {
  const enabledByName = new Map(
    (existing || []).map((tool) => [tool.name, tool.enabled]),
  );
  return next.map((tool) => ({
    ...tool,
    enabled: enabledByName.get(tool.name) ?? tool.enabled,
  }));
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
