import {
  ArrowDownToLine,
  Check,
  Copy,
  FileVolume,
  PanelRightOpen,
  Replace,
  RotateCcw,
  Square,
  Volume2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { COPY_FEEDBACK_MS } from "../../shared/config";
import {
  SMART_BAR_ACTION,
  SMART_BAR_MAX_TEXT_CHARS,
} from "../../shared/smart-bar";
import type { SmartBarPageConfig } from "../../shared/smart-bar-protocol";
import { Button, IconTooltip } from "../../ui/components";
import {
  isEditableSnapshot,
  selectionLanguage,
  type SelectionSnapshot,
} from "../selection";
import { speak } from "../speech";
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
  const [copied, setCopied] = useState(false);
  // The user changed the selected text meanwhile: Copy only.
  const [changed, setChanged] = useState(false);
  const streaming = result.status === "streaming";
  const text = result.text.trim();
  const ready = result.status === "done" && !!text;
  const Icon = SMART_BAR_ICONS[result.action];
  const [reading, setReading] = useState<"source" | "result">();
  const stopReading = useRef<() => void>(undefined);
  // Reading stops with the card.
  useEffect(() => () => stopReading.current?.(), []);
  const sourceLanguage = selectionLanguage(snapshot);
  // Edits keep the text's language; the other actions reply in the
  // extension's language.
  const resultLanguage =
    result.action === SMART_BAR_ACTION.improve ||
    result.action === SMART_BAR_ACTION.fixGrammar
      ? sourceLanguage
      : config.language;
  const read = (which: "source" | "result") => {
    if (reading === which) return stopReading.current?.();
    setReading(which);
    stopReading.current = speak(
      which === "source" ? snapshot.text : text,
      which === "source" ? sourceLanguage : resultLanguage,
      () => setReading((now) => (now === which ? undefined : now)),
    );
  };
  const readButton = (which: "source" | "result") => {
    const label =
      reading === which
        ? t.stopReading
        : which === "source"
          ? t.readSource
          : t.readResult;
    const ReadIcon =
      reading === which ? Square : which === "source" ? FileVolume : Volume2;
    return (
      <IconTooltip label={label} side="top">
        <Button
          variant="ghost"
          size="icon"
          className="smart-bar-icon-button"
          aria-label={label}
          aria-pressed={reading === which}
          onClick={onTrusted(() => read(which))}
        >
          <ReadIcon size={15} />
        </Button>
      </IconTooltip>
    );
  };

  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const write = (mode: WriteMode) => {
    if (writeIntoSelection(snapshot, text, mode)) store.hide();
    else setChanged(true);
  };

  return (
    <div
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
        {resultMessage(result, config)}
        {streaming && result.text && (
          <span className="smart-bar-caret" aria-hidden="true" />
        )}
      </div>
      {changed && (
        <p className="smart-bar-result-notice" role="status">
          {t.selectionChanged}
        </p>
      )}
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
        {ready && isEditableSnapshot(snapshot) && !changed && (
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
        {readButton("source")}
        {ready && readButton("result")}
        {ready && (
          <IconTooltip label={copied ? t.copied : t.actions.copy} side="top">
            <Button
              variant="ghost"
              size="icon"
              className="smart-bar-icon-button"
              aria-label={copied ? t.copied : t.actions.copy}
              onClick={onTrusted(() => void copyText(text).then(setCopied))}
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

function resultMessage(
  result: SmartBarResult,
  { messages: t, language }: SmartBarPageConfig,
) {
  switch (result.status) {
    case "error":
      return result.error || t.emptyResult;
    case "tooLong":
      return t.selectionTooLong.replace(
        "{max}",
        new Intl.NumberFormat(language).format(SMART_BAR_MAX_TEXT_CHARS),
      );
    case "streaming":
      return result.text || t.writing;
    default:
      return result.text || t.emptyResult;
  }
}
