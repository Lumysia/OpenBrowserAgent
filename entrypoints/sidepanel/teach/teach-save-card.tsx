import { FileCheck2 } from "lucide-react";
import { useId, useState } from "react";
import { TEACH_MESSAGE } from "../../../src/shared/teach/messages";
import type { TeachSession } from "../../../src/shared/teach/types";
import { normalizeSkillName } from "../../../src/shared/skills";
import {
  Button,
  Disclosure,
  Feedback,
  Input,
  Label,
  Textarea,
} from "../../../src/ui/components";
import { useMessages } from "../../../src/ui/messages";
import type { TeachController } from "./use-teach";

// The skill the model wrote, before it is saved: its name, description and
// instructions (folded away at first) can be changed, so the user sees what
// the agent will follow; it says what is stored, and saving runs the check
// unless the user saves a draft.
export function TeachSaveCard({
  session,
  teach,
}: {
  session: TeachSession & { draft: NonNullable<TeachSession["draft"]> };
  teach: TeachController;
}) {
  const t = useMessages();
  const words = t.teach.save;
  const id = useId();
  const [name, setName] = useState(session.draft.name);
  const [description, setDescription] = useState(session.draft.description);
  const [body, setBody] = useState(session.draft.body);
  const [busy, setBusy] = useState(false);
  const draft = { name: normalizeSkillName(name), description, body };
  const save = async (check: boolean) => {
    setBusy(true);
    await teach.save(session.tabId, draft, check);
    setBusy(false);
  };
  return (
    <div
      className="composer-card teach-card"
      role="region"
      aria-labelledby={`${id}-title`}
    >
      <div className="composer-card-header">
        <strong id={`${id}-title`}>
          <FileCheck2 size={15} aria-hidden="true" />
          {words.title}
        </strong>
        <small>{words.stored}</small>
      </div>
      <div className="teach-fields">
        <Label htmlFor={`${id}-name`}>{words.name}</Label>
        <Input
          id={`${id}-name`}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => setName(normalizeSkillName(name))}
          spellCheck={false}
        />
        <Label htmlFor={`${id}-description`}>{words.description}</Label>
        <Textarea
          id={`${id}-description`}
          value={description}
          rows={3}
          onChange={(event) => setDescription(event.target.value)}
        />
        <Disclosure label={words.instructions}>
          <Textarea
            aria-label={words.instructions}
            className="teach-body"
            value={body}
            rows={12}
            spellCheck={false}
            onChange={(event) => setBody(event.target.value)}
          />
        </Disclosure>
      </div>
      {teach.error && <Feedback error>{teach.error}</Feedback>}
      <div className="composer-card-actions">
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() =>
            teach.message({ type: TEACH_MESSAGE.discard, tabId: session.tabId })
          }
        >
          {t.teach.recording.discard}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy || !draft.name}
          onClick={() => void save(false)}
        >
          {words.draft}
        </Button>
        <Button
          size="sm"
          title={words.checkHint}
          disabled={busy || !draft.name}
          onClick={() => void save(true)}
        >
          {words.check}
        </Button>
      </div>
    </div>
  );
}
