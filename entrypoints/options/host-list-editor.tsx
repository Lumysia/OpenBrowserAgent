import { Plus, X } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { normalizeHost } from "../../src/shared/site-hosts";
import {
  EMPTY_STATE_VARIANT,
  EmptyState,
  Badge,
  Button,
  Feedback,
  IconTooltip,
  Input,
  Label,
} from "../../src/ui/components";

// An editable list of site hosts ("example.com").
export function HostListEditor({
  label,
  hosts,
  labels,
  onChange,
}: {
  label: string;
  hosts: string[];
  labels: {
    placeholder: string;
    add: string;
    remove: string;
    invalid: string;
    empty: string;
  };
  onChange: (hosts: string[]) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState("");
  const [invalid, setInvalid] = useState(false);

  const add = (event: FormEvent) => {
    event.preventDefault();
    const host = normalizeHost(draft);
    if (!host) return setInvalid(true);
    if (!hosts.includes(host)) onChange([...hosts, host]);
    setDraft("");
    setInvalid(false);
  };

  return (
    <div className="settings-host-list">
      <Label htmlFor={id}>{label}</Label>
      <form className="settings-inline-form" onSubmit={add}>
        <Input
          id={id}
          value={draft}
          placeholder={labels.placeholder}
          aria-invalid={invalid}
          onChange={(event) => {
            setDraft(event.currentTarget.value);
            setInvalid(false);
          }}
        />
        <Button type="submit" variant="outline" disabled={!draft.trim()}>
          <Plus size={15} /> {labels.add}
        </Button>
      </form>
      {invalid && <Feedback error>{labels.invalid}</Feedback>}
      {hosts.length ? (
        <div className="settings-chip-list">
          {hosts.map((host) => {
            const remove = labels.remove.replace("{host}", host);
            return (
              <Badge key={host} className="settings-chip">
                <span className="settings-chip-label">{host}</span>
                <IconTooltip label={remove}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="settings-chip-remove"
                    aria-label={remove}
                    onClick={() =>
                      onChange(hosts.filter((item) => item !== host))
                    }
                  >
                    <X size={12} />
                  </Button>
                </IconTooltip>
              </Badge>
            );
          })}
        </div>
      ) : (
        <EmptyState variant={EMPTY_STATE_VARIANT.inline} title={labels.empty} />
      )}
    </div>
  );
}
