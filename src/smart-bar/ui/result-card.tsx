import {
  ArrowDownToLine,
  Check,
  Copy,
  PanelRightOpen,
  Replace,
  RotateCcw,
  Square,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { COPY_FEEDBACK_MS } from "../../shared/config";
import type { SmartBarPageConfig } from "../../shared/smart-bar-protocol";
import { Button, IconTooltip } from "../../ui/components";
import { isEditableSnapshot, type SelectionSnapshot } from "../selection";
import { copyText, writeIntoSelection, type WriteMode } from "../writeback";
import { openInSidePanel, SMART_BAR_ICONS } from "./page-actions";
import type { SmartBarResult, SmartBarStore } from "./store";
import { onTrusted } from "./trusted";

export function SmartBarResultCard({
  store,
  snapshot,
  config,
  result,
}: {
  store: SmartBarStore;
  snapshot: SelectionSnapshot;
  config: SmartBarPageConfig;
  result: SmartBarResult;
}) {
  const t = config.messages;
  const cardRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const streaming = result.status === "streaming";
  const text = result.text.trim();
  const ready = result.status === "done" && !!text;
  const Icon = SMART_BAR_ICONS[result.action];

  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const write = (mode: WriteMode) => {
    if (writeIntoSelection(snapshot, text, mode)) store.hide();
  };

  return (
    <div
      ref={cardRef}
      className="smart-bar-result"
      role="region"
      aria-label={t.actions[result.action]}
    >
      <div className="smart-bar-result-header">
        <span className="smart-bar-result-title">
          <Icon size={15} /> {t.actions[result.action]}
        </span>
        <IconTooltip label={t.close} side="top">
          <Button
            variant="ghost"
            size="icon"
            className="smart-bar-icon-button"
            aria-label={t.close}
            onClick={onTrusted(store.hide)}
          >
            <X size={15} />
          </Button>
        </IconTooltip>
      </div>
      <div
        className="smart-bar-result-text"
        data-status={result.status}
        aria-live="polite"
        aria-busy={streaming}
      >
        {result.status === "error"
          ? result.error || t.emptyResult
          : result.text || (streaming ? t.writing : t.emptyResult)}
        {streaming && result.text && (
          <span className="smart-bar-caret" aria-hidden="true" />
        )}
      </div>
      <div className="smart-bar-result-actions">
        {streaming && (
          <Button variant="outline" size="sm" onClick={onTrusted(store.stop)}>
            <Square size={13} /> {t.stop}
          </Button>
        )}
        {result.status === "error" && (
          <Button
            variant="outline"
            size="sm"
            onClick={onTrusted(() => store.run(result.action))}
          >
            <RotateCcw size={13} /> {t.retry}
          </Button>
        )}
        {ready && isEditableSnapshot(snapshot) && (
          <>
            <Button size="sm" onClick={onTrusted(() => write("replace"))}>
              <Replace size={13} /> {t.replace}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onTrusted(() => write("insertBelow"))}
            >
              <ArrowDownToLine size={13} /> {t.insertBelow}
            </Button>
          </>
        )}
        <span className="smart-bar-spacer" />
        {ready && (
          <IconTooltip label={copied ? t.copied : t.actions.copy} side="top">
            <Button
              variant="ghost"
              size="icon"
              className="smart-bar-icon-button"
              aria-label={copied ? t.copied : t.actions.copy}
              onClick={onTrusted(
                () => void copyText(text, cardRef.current!).then(setCopied),
              )}
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
            </Button>
          </IconTooltip>
        )}
        <IconTooltip label={t.continueInSidePanel} side="top">
          <Button
            variant="ghost"
            size="icon"
            className="smart-bar-icon-button"
            aria-label={t.continueInSidePanel}
            disabled={streaming}
            onClick={onTrusted(() => {
              void openInSidePanel(
                snapshot.text,
                text ? { action: result.action, text } : undefined,
              );
              store.hide();
            })}
          >
            <PanelRightOpen size={15} />
          </Button>
        </IconTooltip>
      </div>
    </div>
  );
}
