import {
  Check,
  FlaskConical,
  Loader2,
  Plug,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
import { useState } from "react";
import { getMessages } from "../../src/shared/i18n";
import {
  createMcpServerDraft,
  BUILTIN_MCP_SERVERS,
  importMcpServersFromJson,
  isMcpServerTested,
  parseHeadersJson,
} from "../../src/shared/mcp";
import { listMcpServerTools } from "../../src/shared/mcp-client";
import { McpServerFields, untestedPatch } from "./mcp-server-fields";
import { storage } from "../../src/shared/storage";
import type { McpServerConfig } from "../../src/shared/types";
import {
  Accordion,
  AccordionContent,
  AccordionHeader,
  AccordionItem,
  AccordionTriggerButton,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  EmptyState,
  CardTitle,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Switch,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  SettingsSummary,
} from "../../src/ui/components";
import { useStoredState } from "../../src/ui/useStoredState";

export function McpPage() {
  const [language] = useStoredState(storage.language);
  const [servers, setServers] = useStoredState(storage.mcpServers);
  const [importDraft, setImportDraft] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [importMenuOpen, setImportMenuOpen] = useState(false);
  const [testingServerId, setTestingServerId] = useState<string | null>(null);
  const [recentlyTestedServerId, setRecentlyTestedServerId] = useState("");
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
      setRecentlyTestedServerId(server.id);
      window.setTimeout(() => {
        setRecentlyTestedServerId((current) =>
          current === server.id ? "" : current,
        );
      }, 2500);
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

  function resetBuiltinMcpServers() {
    const builtinIds = new Set(BUILTIN_MCP_SERVERS.map((server) => server.id));
    setServers((current) => [
      ...cloneDefault(BUILTIN_MCP_SERVERS),
      ...current.filter((server) => !builtinIds.has(server.id)),
    ]);
    setImportDraft("");
    setImportMessage("");
    setImportMenuOpen(false);
  }

  return (
    <div className="stack">
      <div className="settings-page-header">
        <div>
          <h1 className="settings-page-title">
            <Plug size={24} /> {t.options.mcpServers}
          </h1>
          <p className="muted">{t.options.mcpServersDescription}</p>
        </div>
        <div className="settings-page-actions">
          {items.length ? (
            <Button onClick={addServer}>
              <Plus size={15} /> {t.options.newMcpServer}
            </Button>
          ) : null}
          <Tooltip>
            <Popover open={importMenuOpen} onOpenChange={setImportMenuOpen}>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button size="icon" aria-label={t.options.mcpImportButton}>
                    <Upload size={15} />
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
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
            <TooltipContent>{t.options.mcpImportButton}</TooltipContent>
          </Tooltip>
        </div>
      </div>
      {!items.length ? (
        <EmptyState
          icon={<Plug size={28} />}
          title={t.options.mcpServersEmpty}
          action={
            <Button onClick={addServer}>
              <Plus size={15} /> {t.options.newMcpServer}
            </Button>
          }
        />
      ) : null}
      <Accordion type="multiple" className="stack">
        {items.map((server) => (
          <AccordionItem key={server.id} value={server.id}>
            <AccordionHeader className="ui-accordion-header-with-actions">
              <AccordionTriggerButton hideChevron>
                <SettingsSummary
                  icon={<Plug size={18} />}
                  title={server.name || t.options.newMcpServer}
                  badges={<Badge title={server.id}>{server.id}</Badge>}
                  description={
                    server.description ||
                    server.url ||
                    t.options.mcpServerUrlPlaceholder
                  }
                />
              </AccordionTriggerButton>
              <span
                className="accordion-trigger-actions"
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="tooltip-button-wrapper">
                      <Button
                        size="icon"
                        aria-label={
                          testingServerId === server.id
                            ? t.options.mcpTesting
                            : t.options.mcpTestServer
                        }
                        disabled={!server.url || testingServerId === server.id}
                        onClick={() => testServer(server)}
                      >
                        {testingServerId === server.id ? (
                          <Loader2 size={14} className="spin" />
                        ) : recentlyTestedServerId === server.id ? (
                          <Check size={14} />
                        ) : (
                          <FlaskConical size={14} />
                        )}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    {testingServerId === server.id
                      ? t.options.mcpTesting
                      : t.options.mcpTestServer}
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Switch
                      aria-label={server.name || t.options.mcpServerEnabled}
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
                <McpServerFields
                  t={t}
                  server={server}
                  onUpdate={(patch) => updateServer(server.id, patch)}
                  onHeadersChange={(value) => updateHeaders(server.id, value)}
                />
                {server.lastTestError && (
                  <CardDescription>{server.lastTestError}</CardDescription>
                )}
                <div className="row">
                  <Button
                    variant="destructiveOutline"
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
            <div className="row">
              <Button variant="outline" onClick={resetBuiltinMcpServers}>
                {t.options.resetBuiltins}
              </Button>
              <Button variant="outline" onClick={resetDefaultMcpServers}>
                {t.options.resetDefaults}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function cloneDefault<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
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
