import {
  ArrowDownToLine,
  Check,
  Copy,
  FileVolume,
  PanelRightOpen,
  Replace,
  RotateCcw,
  ShieldCheck,
  Square,
  Volume2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { COPY_FEEDBACK_MS } from "../../shared/config";
import { SIDE_PANEL_TASK } from "../../shared/side-panel-handoff";
import {
  SMART_BAR_ACTION,
  SMART_BAR_MAX_TEXT_CHARS,
} from "../../shared/smart-bar";
import { languageDetect } from "../../shared/language-detector";
import type { SmartBarPageConfig } from "../../shared/smart-bar-protocol";
import { Button, IconTooltip } from "../../ui/components";
import { providerConsentAgreement } from "../../ui/provider-display";
import {
  isEditableSnapshot,
  selectionLanguage,
  type SelectionSnapshot,
} from "../selection";
import { speak } from "../speech";
import { copyText, writeIntoSelection, type WriteMode } from "../writeback";
import { SmartBarDictionaryCard } from "./dictionary-card";
import { openInSidePanel, SMART_BAR_ICONS } from "./page-actions";
import { readResultPieces, readSourcePieces } from "./read-aloud";
import { smartBarOutput } from "./result-output";
import type { SmartBarResult, SmartBarStore } from "./store";
import { onTrusted } from "./trusted";

// One detector for the frame, created when first needed.
const detectLanguage = languageDetect();

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
  const output = useMemo(
    () => smartBarOutput(result, t.dictionary),
    [result, t.dictionary],
  );
  const ready = result.status === "done" && !!output.copy;
  const Icon = SMART_BAR_ICONS[result.action];
  const [reading, setReading] = useState<"source" | "result">();
  // Languages the last read found no voice for.
  const [noVoice, setNoVoice] = useState<string[]>();
  const stopReading = useRef<() => void>(undefined);
  // Reading stops with the card.
  useEffect(() => () => stopReading.current?.(), []);
  const pageLanguage = selectionLanguage(snapshot);
  const read = (which: "source" | "result") => {
    if (reading === which) return stopReading.current?.();
    setReading(which);
    setNoVoice(undefined);
    const input = {
      action: result.action,
      source: snapshot.text,
      output,
      languages: {
        page: pageLanguage,
        reply: config.replyLanguage,
        ui: config.language,
      },
    };
    stopReading.current = speak(
      () =>
        which === "source"
          ? readSourcePieces(input, detectLanguage)
          : readResultPieces(input, detectLanguage),
      {
        onEnd: () => setReading((now) => (now === which ? undefined : now)),
        onMissingVoices: setNoVoice,
      },
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
    if (writeIntoSelection(snapshot, output.write, mode)) store.hide();
    else setChanged(true);
  };

  return (
    <div
      className="smart-bar-result page-surface"
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
        className="smart-bar-result-text ui-selectable"
        data-status={result.status}
        data-format={output.entry ? result.format : undefined}
        aria-live="polite"
        aria-busy={streaming}
      >
        {output.entry ? (
          <SmartBarDictionaryCard
            entry={output.entry}
            labels={t.dictionary}
            sourceLanguage={pageLanguage}
          />
        ) : (
          resultMessage(result, output.shown, config)
        )}
        {streaming && (output.entry || output.shown) && (
          <span className="smart-bar-caret" aria-hidden="true" />
        )}
      </div>
      {changed && (
        <p className="smart-bar-result-notice" role="status">
          {t.selectionChanged}
        </p>
      )}
      {noVoice && (
        <p className="smart-bar-result-notice" role="status">
          {t.noVoice.replace(
            "{language}",
            languageNames(noVoice, config.language),
          )}
        </p>
      )}
      <div className="smart-bar-result-actions">
        {streaming && (
          <Button variant="outline" size="sm" onClick={onTrusted(store.stop)}>
            <Square size={13} /> {t.stop}
          </Button>
        )}
        {result.status === "consent" && (
          <>
            <Button size="sm" onClick={onTrusted(store.allowProvider)}>
              <ShieldCheck size={13} /> {config.providerConsent.allow}
            </Button>
            <Button variant="outline" size="sm" onClick={onTrusted(store.hide)}>
              {config.providerConsent.decline}
            </Button>
          </>
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
        {ready && output.write && isEditableSnapshot(snapshot) && !changed && (
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
        {ready && (output.write || output.entry) && readButton("result")}
        {ready && (
          <IconTooltip label={copied ? t.copied : t.actions.copy} side="top">
            <Button
              variant="ghost"
              size="icon"
              className="smart-bar-icon-button"
              aria-label={copied ? t.copied : t.actions.copy}
              onClick={onTrusted(
                () => void copyText(output.copy).then(setCopied),
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
                output.copy
                  ? {
                      task: SIDE_PANEL_TASK.continue,
                      text: snapshot.text,
                      result: { action: result.action, text: output.copy },
                    }
                  : { task: SIDE_PANEL_TASK.ask, text: snapshot.text },
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

// "Japanese and Korean", in the UI language.
function languageNames(languages: string[], uiLanguage: string) {
  const names = languages.map((language) => {
    try {
      return (
        new Intl.DisplayNames(uiLanguage, { type: "language" }).of(language) ||
        language
      );
    } catch {
      return language;
    }
  });
  try {
    return new Intl.ListFormat(uiLanguage, { type: "conjunction" }).format(
      names,
    );
  } catch {
    return names.join(", ");
  }
}

function resultMessage(
  result: SmartBarResult,
  text: string,
  { messages: t, language, providerConsent }: SmartBarPageConfig,
) {
  switch (result.status) {
    case "consent":
      return providerConsentAgreement(
        result.consent?.host || "",
        providerConsent,
      );
    case "error":
      return result.error || t.connectionLost;
    case "tooLong":
      return t.selectionTooLong.replace(
        "{max}",
        new Intl.NumberFormat(language).format(SMART_BAR_MAX_TEXT_CHARS),
      );
    case "streaming":
      return text || (result.thinking ? t.thinking : t.writing);
    default:
      return text || t.emptyResult;
  }
}
