import { Plug, Plus, Sparkles, Trash2, Upload } from "lucide-react";
import { useState } from "react";
import { formatCount, getMessages } from "../../src/shared/i18n";
import {
  createMcpServerDraft,
  importMcpServersFromJson,
  isMcpServerTested,
  mcpNeedsRetest,
  mcpTestedPatch,
  mcpUntestedPatch,
  parseHeadersJson,
} from "../../src/shared/mcp";
import {
  mcpServerFromPreset,
  missingMcpServerPresets,
  type McpServerPreset,
} from "../../src/shared/mcp-presets";
import { listMcpServerTools } from "../../src/shared/mcp-client";
import {
  mcpPresetDescription,
  mcpServerDescription,
} from "../../src/ui/mcp-display";
import { McpServerFields } from "./mcp-server-fields";
import { storage } from "../../src/shared/storage";
import type { McpServerConfig } from "../../src/shared/types";
import {
  Accordion,
  Badge,
  Button,
  CardDescription,
  EmptyState,
  Feedback,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Switch,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  SettingsSummary,
  SettingsPageHeader,
  ConfirmButton,
  SettingsAccordionItem,
  TestButton,
  SettingsSection,
} from "../../src/ui/components";
import { useStoredState } from "../../src/ui/useStoredState";
import { errorWithDetail } from "../../src/shared/user-errors";
import { useTransient } from "../../src/ui/use-transient";
import { errorMessage } from "../../src/shared/error-message";
import { useMessages } from "../../src/ui/messages";

export function McpPage() {
  const [servers, setServers] = useStoredState(storage.mcpServers);
  const [importDraft, setImportDraft] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [importMenuOpen, setImportMenuOpen] = useState(false);
  const [testingServerId, setTestingServerId] = useState<string | null>(null);
  const [testedServerId, showTested] = useTransient<string>();
  const t = useMessages();
  const items = servers || [];
  const presets = missingMcpServerPresets(items);

  function addServer() {
    setServers((current) => [
      ...current,
      createMcpServerDraft(t.options.newMcpServer),
    ]);
  }

  function addPreset(preset: McpServerPreset) {
    const server = mcpServerFromPreset(preset);
    setServers((current) => [...current, server]);
  }

  function updateServer(serverId: string, patch: Partial<McpServerConfig>) {
    const now = Date.now();
    const retest = mcpNeedsRetest(patch) ? mcpUntestedPatch() : {};
    setServers((current) =>
      current.map((server) =>
        server.id === serverId
          ? { ...server, ...patch, ...retest, updatedAt: now }
          : server,
      ),
    );
  }

  function updateHeaders(serverId: string, value: string) {
    try {
      updateServer(serverId, { headers: parseHeadersJson(value) });
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
      updateServer(server.id, mcpTestedPatch(server, tools));
      showTested(server.id);
    } catch (error) {
      // Stored as the error's own text and localized when shown, like the
      // tests the agent runs.
      updateServer(server.id, mcpUntestedPatch(errorMessage(error)));
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
        formatCount(t.options.mcpImportSuccess, result.servers.length),
      );
    } catch (error) {
      setImportMessage(errorWithDetail(t.options.mcpImportError, error, t));
    }
  }

  return (
    <div className="stack">
      <SettingsPageHeader
        icon={<Plug />}
        title={t.options.mcpServers}
        description={t.options.mcpServersDescription}
        actions={
          <>
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
                <PopoverContent
                  className="settings-popover-content"
                  align="end"
                >
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
          </>
        }
      />
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
          <SettingsAccordionItem
            key={server.id}
            value={server.id}
            chevronLabel={server.name || t.options.newMcpServer}
            contentClassName="stack"
            summary={
              <SettingsSummary
                icon={<Plug size={18} />}
                title={server.name || t.options.newMcpServer}
                badges={<Badge title={server.id}>{server.id}</Badge>}
                description={
                  mcpServerDescription(server, t) ||
                  server.url ||
                  t.options.mcpServerUrlPlaceholder
                }
              />
            }
            actions={
              <>
                <TestButton
                  state={
                    testingServerId === server.id
                      ? "testing"
                      : testedServerId === server.id
                        ? "done"
                        : "idle"
                  }
                  label={t.options.mcpTestServer}
                  testingLabel={t.options.mcpTesting}
                  disabled={!server.url}
                  onClick={() => testServer(server)}
                />
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
                      ? formatCount(
                          t.options.mcpEnableTooltipTested,
                          server.tools?.length || 0,
                        )
                      : t.options.mcpEnableRequiresTest}
                  </TooltipContent>
                </Tooltip>
              </>
            }
          >
            <McpServerFields
              server={server}
              onUpdate={(patch) => updateServer(server.id, patch)}
              onHeadersChange={(value) => updateHeaders(server.id, value)}
            />
            {server.lastTestError && (
              <Feedback error>
                {errorWithDetail(
                  t.options.mcpTestError,
                  server.lastTestError,
                  t,
                )}
              </Feedback>
            )}
            <div className="row">
              <ConfirmButton
                confirmLabel={t.common.confirm}
                cancelLabel={t.common.cancel}
                onConfirm={() => deleteServer(server.id)}
              >
                <Trash2 size={15} /> {t.options.deleteMcpServer}
              </ConfirmButton>
            </div>
          </SettingsAccordionItem>
        ))}
      </Accordion>
      {presets.length ? (
        <SettingsSection
          icon={<Sparkles />}
          title={t.options.mcpPresets}
          description={t.options.mcpPresetsDescription}
          contentClassName="stack"
        >
          {presets.map((preset) => (
            <div key={preset.id} className="setting-switch-row">
              <SettingsSummary
                icon={<Plug size={18} />}
                title={preset.name}
                description={mcpPresetDescription(preset, t)}
              />
              <Button variant="outline" onClick={() => addPreset(preset)}>
                <Plus size={15} /> {t.options.mcpPresetAdd}
              </Button>
            </div>
          ))}
        </SettingsSection>
      ) : null}
    </div>
  );
}
