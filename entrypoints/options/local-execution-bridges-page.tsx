import { useState } from "react";
import {
  Check,
  FlaskConical,
  Loader2,
  Plus,
  RefreshCw,
  TerminalSquare,
  Trash2,
} from "lucide-react";
import {
  createLocalExecutionBridgeDraft,
  generateLocalExecutionBridgeSecret,
  normalizeLocalExecutionBridges,
} from "../../src/shared/local-execution-bridges";
import { sendLocalExecutionBridgeRuntimeRequest } from "../../src/shared/local-execution-bridge-runtime";
import { getMessages } from "../../src/shared/i18n";
import { storage } from "../../src/shared/storage";
import type { LocalExecutionBridgeConfig } from "../../src/shared/types";
import {
  Accordion,
  AccordionContent,
  AccordionHeader,
  AccordionItem,
  AccordionTriggerButton,
  Badge,
  Button,
  CardDescription,
  Input,
  Label,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../src/ui/components";
import { useStoredState } from "../../src/ui/useStoredState";

export function LocalExecutionBridgesPage() {
  const [language] = useStoredState(storage.language);
  const [bridges, setBridges] = useStoredState(storage.localExecutionBridges);
  const [testingBridgeId, setTestingBridgeId] = useState("");
  const [recentlyTestedBridgeId, setRecentlyTestedBridgeId] = useState("");
  const t = getMessages(language);
  const items = normalizeLocalExecutionBridges(bridges);

  function addBridge() {
    setBridges((current) => [
      ...normalizeLocalExecutionBridges(current),
      createLocalExecutionBridgeDraft(t.options.newLocalExecutionBridge),
    ]);
  }

  function updateBridge(
    bridgeId: string,
    patch: Partial<LocalExecutionBridgeConfig>,
  ) {
    setBridges((current) =>
      normalizeLocalExecutionBridges(current).map((bridge) =>
        bridge.id === bridgeId
          ? {
              ...bridge,
              ...patch,
              ...testResetPatch(patch),
              updatedAt: Date.now(),
            }
          : bridge,
      ),
    );
  }

  function deleteBridge(bridgeId: string) {
    setBridges((current) =>
      normalizeLocalExecutionBridges(current).filter(
        (bridge) => bridge.id !== bridgeId,
      ),
    );
  }

  async function testBridge(bridgeId: string) {
    setTestingBridgeId(bridgeId);
    try {
      await sendLocalExecutionBridgeRuntimeRequest({
        operation: "test",
        bridgeId,
      });
      updateBridge(bridgeId, { lastTestedAt: Date.now(), lastTestError: "" });
      setRecentlyTestedBridgeId(bridgeId);
      window.setTimeout(() => {
        setRecentlyTestedBridgeId((current) =>
          current === bridgeId ? "" : current,
        );
      }, 2500);
      return true;
    } catch (error) {
      updateBridge(bridgeId, {
        lastTestedAt: undefined,
        lastTestError: `${t.options.localExecutionBridgeTestError}: ${error instanceof Error ? error.message : String(error)}`,
      });
      return false;
    } finally {
      setTestingBridgeId("");
    }
  }

  return (
    <div className="stack">
      <div className="settings-page-header">
        <div>
          <h1 className="settings-page-title">
            <TerminalSquare size={24} /> {t.options.localExecutionBridges}
          </h1>
          <p className="muted">{t.options.localExecutionBridgesDescription}</p>
        </div>
        <div className="settings-page-actions">
          <Button onClick={addBridge}>
            <Plus size={15} /> {t.options.newLocalExecutionBridge}
          </Button>
        </div>
      </div>
      {!items.length ? (
        <CardDescription>
          {t.options.localExecutionBridgesEmpty}
        </CardDescription>
      ) : null}
      <Accordion type="multiple" className="stack">
        {items.map((bridge) => (
          <AccordionItem key={bridge.id} value={bridge.id}>
            <AccordionHeader className="ui-accordion-header-with-actions">
              <AccordionTriggerButton hideChevron>
                <span className="settings-summary">
                  <span className="settings-summary-title">
                    <TerminalSquare size={18} />
                    <span>{bridge.name}</span>
                    <Badge>{bridge.id.slice(0, 8)}</Badge>
                    {bridge.lastTestError ? (
                      <Badge className="status-error-badge">
                        {t.options.localExecutionBridgeTestError}
                      </Badge>
                    ) : null}
                  </span>
                  <small>{bridge.description || bridge.hostName}</small>
                </span>
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
                          testingBridgeId === bridge.id
                            ? t.options.localExecutionBridgeTesting
                            : t.options.localExecutionBridgeTest
                        }
                        disabled={
                          testingBridgeId === bridge.id || !bridge.hostName
                        }
                        onClick={() => testBridge(bridge.id)}
                      >
                        {testingBridgeId === bridge.id ? (
                          <Loader2 size={14} className="spin" />
                        ) : recentlyTestedBridgeId === bridge.id ? (
                          <Check size={14} />
                        ) : (
                          <FlaskConical size={14} />
                        )}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    {testingBridgeId === bridge.id
                      ? t.options.localExecutionBridgeTesting
                      : t.options.localExecutionBridgeTest}
                  </TooltipContent>
                </Tooltip>
              </span>
              <AccordionTriggerButton
                className="accordion-chevron-trigger"
                aria-label={bridge.name || t.options.newLocalExecutionBridge}
              />
            </AccordionHeader>
            <AccordionContent>
              <div className="stack">
                <Label>
                  {t.options.localExecutionBridgeName}
                  <Input
                    value={bridge.name}
                    onChange={(event) =>
                      updateBridge(bridge.id, {
                        name: event.currentTarget.value,
                      })
                    }
                  />
                </Label>
                <Label>
                  {t.options.localExecutionBridgeDescription}
                  <Textarea
                    value={bridge.description || ""}
                    onChange={(event) =>
                      updateBridge(bridge.id, {
                        description: event.currentTarget.value,
                      })
                    }
                  />
                </Label>
                <Label>
                  {t.options.localExecutionBridgeHostName}
                  <Input
                    value={bridge.hostName}
                    placeholder="openbrowseragent.local_execution_bridge"
                    onChange={(event) =>
                      updateBridge(bridge.id, {
                        hostName: event.currentTarget.value,
                      })
                    }
                  />
                </Label>
                <Label>
                  {t.options.localExecutionBridgeHostAddress}
                  <Input
                    value={bridge.hostAddress || ""}
                    placeholder={
                      t.options.localExecutionBridgeHostAddressPlaceholder
                    }
                    onChange={(event) =>
                      updateBridge(bridge.id, {
                        hostAddress: event.currentTarget.value,
                      })
                    }
                  />
                </Label>
                <Label>
                  {t.options.localExecutionBridgeSecret}
                  <div className="row">
                    <Input
                      value={bridge.secret || ""}
                      onChange={(event) =>
                        updateBridge(bridge.id, {
                          secret: event.currentTarget.value,
                        })
                      }
                    />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          aria-label={
                            t.options.localExecutionBridgeRegenerateSecret
                          }
                          onClick={() =>
                            updateBridge(bridge.id, {
                              secret: generateLocalExecutionBridgeSecret(),
                            })
                          }
                        >
                          <RefreshCw size={14} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {t.options.localExecutionBridgeRegenerateSecret}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </Label>
                <Label>
                  {t.options.localExecutionBridgeKey}
                  <Input
                    value={bridge.bridgeKey || ""}
                    placeholder="default"
                    onChange={(event) =>
                      updateBridge(bridge.id, {
                        bridgeKey: event.currentTarget.value,
                      })
                    }
                  />
                </Label>
                <Label>
                  {t.options.localExecutionBridgeDefaultCwd}
                  <Input
                    value={bridge.defaultCwd || ""}
                    placeholder="~/Desktop"
                    onChange={(event) =>
                      updateBridge(bridge.id, {
                        defaultCwd: event.currentTarget.value,
                      })
                    }
                  />
                </Label>
                <Label>
                  {t.options.localExecutionBridgeTimeoutMs}
                  <Input
                    type="number"
                    min={1000}
                    value={bridge.timeoutMs || 120000}
                    onChange={(event) =>
                      updateBridge(bridge.id, {
                        timeoutMs: Number(event.currentTarget.value),
                      })
                    }
                  />
                </Label>
                {bridge.lastTestError ? (
                  <CardDescription>{bridge.lastTestError}</CardDescription>
                ) : null}
                {isLocalExecutionBridgeTested(bridge) ? (
                  <CardDescription>
                    {t.options.localExecutionBridgeTestSuccess}
                  </CardDescription>
                ) : null}
                <div className="row">
                  <Button
                    variant="destructiveOutline"
                    onClick={() => deleteBridge(bridge.id)}
                  >
                    <Trash2 size={15} /> {t.options.deleteLocalExecutionBridge}
                  </Button>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}

function isLocalExecutionBridgeTested(bridge: LocalExecutionBridgeConfig) {
  return !!bridge.lastTestedAt && !bridge.lastTestError;
}

function testResetPatch(patch: Partial<LocalExecutionBridgeConfig>) {
  if (
    !("hostName" in patch) &&
    !("hostAddress" in patch) &&
    !("secret" in patch) &&
    !("bridgeKey" in patch)
  )
    return {};
  return { lastTestedAt: undefined, lastTestError: "" };
}
