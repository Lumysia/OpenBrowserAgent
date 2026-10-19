import { CircleAlert, CircleDot, PenLine } from "lucide-react";
import { useId, useState } from "react";
import { TEACH_MESSAGE } from "../../../src/shared/teach/messages";
import { TEACH_STATE } from "../../../src/shared/teach/types";
import { Button, Feedback, Input, Label } from "../../../src/ui/components";
import { useMessages } from "../../../src/ui/messages";
import { useChat, useComposer } from "../sidepanel-providers";
import { TeachCheckCard } from "./teach-check-card";
import { TeachRecordingCard } from "./teach-recording-card";
import { TeachSaveCard } from "./teach-save-card";
import type { TeachController, TeachStartTarget } from "./use-teach";

// Teach mode above the composer: the start form, the recording, the
// skill being written, the save card, and a check run's outcome.
export function TeachCard() {
  const { teach } = useComposer();
  const { streaming } = useChat();
  const { session, starting, check } = teach;
  if (starting) return <TeachStartCard target={starting} teach={teach} />;
  if (session?.state === TEACH_STATE.recording)
    return <TeachRecordingCard session={session} teach={teach} />;
  if (session?.state === TEACH_STATE.review && session.draft)
    return (
      <TeachSaveCard
        key={session.id}
        session={{ ...session, draft: session.draft }}
        teach={teach}
      />
    );
  if (session?.state === TEACH_STATE.writing)
    return <TeachWritingCard tabId={session.tabId} teach={teach} />;
  if (session?.state === TEACH_STATE.failed)
    return (
      <TeachFailedCard
        tabId={session.tabId}
        error={session.error || ""}
        teach={teach}
      />
    );
  if (check && !streaming)
    return <TeachCheckCard check={check} teach={teach} disabled={streaming} />;
  return null;
}

function TeachStartCard({
  target,
  teach,
}: {
  target: TeachStartTarget;
  teach: TeachController;
}) {
  const t = useMessages();
  const words = t.teach.start;
  const id = useId();
  const [purpose, setPurpose] = useState("");
  const [varies, setVaries] = useState("");
  return (
    <form
      className="composer-card teach-card"
      aria-labelledby={`${id}-title`}
      onSubmit={(event) => {
        event.preventDefault();
        void teach.start(target, { purpose, varies });
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        teach.cancelStart();
      }}
    >
      <div className="composer-card-header">
        <strong id={`${id}-title`}>
          <CircleDot size={15} aria-hidden="true" />
          {words.title}
        </strong>
        <small>
          {target.scriptable ? words.description : words.unscriptable}
        </small>
      </div>
      {target.scriptable && (
        <div className="teach-fields">
          <Label htmlFor={`${id}-purpose`}>{words.purpose}</Label>
          <Input
            id={`${id}-purpose`}
            value={purpose}
            placeholder={words.purposePlaceholder}
            onChange={(event) => setPurpose(event.target.value)}
            autoFocus
          />
          <Label htmlFor={`${id}-varies`}>{words.varies}</Label>
          <Input
            id={`${id}-varies`}
            value={varies}
            placeholder={words.variesPlaceholder}
            onChange={(event) => setVaries(event.target.value)}
          />
          <small className="teach-note">{words.privacy}</small>
        </div>
      )}
      {teach.error && <Feedback error>{teach.error}</Feedback>}
      <div className="composer-card-actions">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={teach.cancelStart}
        >
          {t.common.cancel}
        </Button>
        <Button type="submit" size="sm" disabled={!target.scriptable}>
          {words.start}
        </Button>
      </div>
    </form>
  );
}

function TeachWritingCard({
  tabId,
  teach,
}: {
  tabId: number;
  teach: TeachController;
}) {
  const t = useMessages();
  return (
    <div className="composer-card teach-card" role="status" aria-busy="true">
      <div className="composer-card-header">
        <strong>
          <PenLine size={15} aria-hidden="true" className="teach-writing" />
          {t.teach.writing.title}
        </strong>
        <small>{t.teach.writing.description}</small>
      </div>
      <div className="composer-card-actions">
        <Button
          variant="outline"
          size="sm"
          onClick={() => teach.message({ type: TEACH_MESSAGE.discard, tabId })}
        >
          {t.teach.recording.discard}
        </Button>
      </div>
    </div>
  );
}

function TeachFailedCard({
  tabId,
  error,
  teach,
}: {
  tabId: number;
  error: string;
  teach: TeachController;
}) {
  const t = useMessages();
  return (
    <div className="composer-card teach-card" role="alert">
      <div className="composer-card-header">
        <strong>
          <CircleAlert size={15} aria-hidden="true" />
          {t.teach.failed.title}
        </strong>
        {error && <small>{error}</small>}
      </div>
      <div className="composer-card-actions">
        <Button
          variant="outline"
          size="sm"
          onClick={() => teach.message({ type: TEACH_MESSAGE.discard, tabId })}
        >
          {t.teach.recording.discard}
        </Button>
        <Button
          size="sm"
          onClick={() => teach.message({ type: TEACH_MESSAGE.rewrite, tabId })}
        >
          {t.teach.failed.retry}
        </Button>
      </div>
    </div>
  );
}
