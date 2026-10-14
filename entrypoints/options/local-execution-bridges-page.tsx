import { useState } from "react";
import { Plus, RefreshCw, TerminalSquare, Trash2 } from "lucide-react";
import {
  LOCAL_EXECUTION_BRIDGE_DEFAULT_HOST_NAME,
  LOCAL_EXECUTION_BRIDGE_DEFAULT_KEY,
  LOCAL_EXECUTION_BRIDGE_DEFAULT_TIMEOUT_MS,
  createLocalExecutionBridgeDraft,
  generateLocalExecutionBridgeSecret,
  normalizeLocalExecutionBridges,
  LOCAL_EXECUTION_BRIDGE_FALLBACK_NAME,
} from "../../src/shared/local-execution-bridges";
import { sendLocalExecutionBridgeRuntimeRequest } from "../../src/shared/local-execution-bridge-runtime";
import { getMessages, type Messages } from "../../src/shared/i18n";
import { storage } from "../../src/shared/storage";
import type { LocalExecutionBridgeConfig } from "../../src/shared/types";
import {
  Accordion,
  Badge,
  Button,
  CardDescription,
  EmptyState,
  Feedback,
  Label,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  SettingsSummary,
  SettingsPageHeader,
  CommitInput,
  CommitTextarea,
  ConfirmButton,
  SettingsAccordionItem,
  TestButton,
} from "../../src/ui/components";
import { useTransient } from "../../src/ui/use-transient";
import { errorMessage } from "../../src/shared/error-message";
import { useStoredState } from "../../src/ui/useStoredState";
import { errorWithDetail } from "../../src/shared/user-errors";
import { useUiLanguage } from "../../src/ui/messages";

export function LocalExecutionBridgesPage() {
  const language = useUiLanguage();
  const [bridges, setBridges] = useStoredState(storage.localExecutionBridges);
  const [testingBridgeId, setTestingBridgeId] = useState("");
  const [testedBridgeId, showTested] = useTransient<string>();
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
      showTested(bridgeId);
      return true;
    } catch (error) {
      // Stored as the error's own text and localized when shown.
      updateBridge(bridgeId, {
        lastTestedAt: undefined,
        lastTestError: errorMessage(error),
      });
      return false;
    } finally {
      setTestingBridgeId("");
    }
  }

  return (
    <div className="stack">
      <SettingsPageHeader
        icon={<TerminalSquare />}
        title={t.options.localExecutionBridges}
        description={t.options.localExecutionBridgesDescription}
        actions={
          items.length ? (
            <>
              <Button onClick={addBridge}>
                <Plus size={15} /> {t.options.newLocalExecutionBridge}
              </Button>
            </>
          ) : undefined
        }
      />
      {!items.length ? (
        <EmptyState
          icon={<TerminalSquare size={28} />}
          title={t.options.localExecutionBridgesEmpty}
          action={
            <Button onClick={addBridge}>
              <Plus size={15} /> {t.options.newLocalExecutionBridge}
            </Button>
          }
        />
      ) : null}
      <Accordion type="multiple" className="stack">
        {items.map((bridge) => (
          <SettingsAccordionItem
            key={bridge.id}
            value={bridge.id}
            chevronLabel={bridgeName(bridge, t)}
            contentClassName="stack"
            summary={
              <SettingsSummary
                icon={<TerminalSquare size={18} />}
                title={bridgeName(bridge, t)}
                badges={
                  <>
                    <Badge title={bridge.id}>{bridge.id.slice(0, 8)}</Badge>
                    {bridge.lastTestError ? (
                      <Badge className="status-error-badge">
                        {t.options.localExecutionBridgeTestError}
                      </Badge>
                    ) : null}
                  </>
                }
                description={bridge.description || bridge.hostName}
              />
            }
            actions={
              <TestButton
                state={
                  testingBridgeId === bridge.id
                    ? "testing"
                    : testedBridgeId === bridge.id
                      ? "done"
                      : "idle"
                }
                label={t.options.localExecutionBridgeTest}
                testingLabel={t.options.localExecutionBridgeTesting}
                disabled={!bridge.hostName}
                onClick={() => testBridge(bridge.id)}
              />
            }
          >
            <Label>
              {t.options.localExecutionBridgeName}
              <CommitInput
                value={bridge.name}
                onCommit={(name) => updateBridge(bridge.id, { name })}
              />
            </Label>
            <Label>
              {t.options.localExecutionBridgeDescription}
              <CommitTextarea
                value={bridge.description || ""}
                onCommit={(description) =>
                  updateBridge(bridge.id, { description })
                }
              />
            </Label>
            <Label>
              {t.options.localExecutionBridgeHostName}
              <CommitInput
                value={bridge.hostName}
                placeholder={LOCAL_EXECUTION_BRIDGE_DEFAULT_HOST_NAME}
                onCommit={(hostName) => updateBridge(bridge.id, { hostName })}
              />
            </Label>
            <Label>
              {t.options.localExecutionBridgeHostAddress}
              <CommitInput
                value={bridge.hostAddress || ""}
                placeholder={
                  t.options.localExecutionBridgeHostAddressPlaceholder
                }
                onCommit={(hostAddress) =>
                  updateBridge(bridge.id, { hostAddress })
                }
              />
            </Label>
            <Label>
              {t.options.localExecutionBridgeSecret}
              <div className="row">
                <CommitInput
                  value={bridge.secret || ""}
                  onCommit={(secret) => updateBridge(bridge.id, { secret })}
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
              <CommitInput
                value={bridge.bridgeKey || ""}
                placeholder={LOCAL_EXECUTION_BRIDGE_DEFAULT_KEY}
                onCommit={(bridgeKey) => updateBridge(bridge.id, { bridgeKey })}
              />
            </Label>
            <Label>
              {t.options.localExecutionBridgeDefaultCwd}
              <CommitInput
                value={bridge.defaultCwd || ""}
                onCommit={(defaultCwd) =>
                  updateBridge(bridge.id, { defaultCwd })
                }
              />
            </Label>
            <Label>
              {t.options.localExecutionBridgeTimeoutMs}
              <CommitInput
                type="number"
                min={1000}
                value={String(
                  bridge.timeoutMs || LOCAL_EXECUTION_BRIDGE_DEFAULT_TIMEOUT_MS,
                )}
                onCommit={(timeoutMs) =>
                  updateBridge(bridge.id, { timeoutMs: Number(timeoutMs) })
                }
              />
            </Label>
            {bridge.lastTestError ? (
              <Feedback error>
                {errorWithDetail(
                  t.options.localExecutionBridgeTestError,
                  bridge.lastTestError,
                  t,
                )}
              </Feedback>
            ) : null}
            {isLocalExecutionBridgeTested(bridge) ? (
              <CardDescription>
                {t.options.localExecutionBridgeTestSuccess}
              </CardDescription>
            ) : null}
            <div className="row">
              <ConfirmButton
                confirmLabel={t.common.confirm}
                cancelLabel={t.common.cancel}
                onConfirm={() => deleteBridge(bridge.id)}
              >
                <Trash2 size={15} /> {t.options.deleteLocalExecutionBridge}
              </ConfirmButton>
            </div>
          </SettingsAccordionItem>
        ))}
      </Accordion>
    </div>
  );
}

function bridgeName(bridge: LocalExecutionBridgeConfig, t: Messages) {
  if (!bridge.name) return t.options.newLocalExecutionBridge;
  return bridge.name === LOCAL_EXECUTION_BRIDGE_FALLBACK_NAME
    ? t.options.localExecutionBridgeUntitled
    : bridge.name;
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
