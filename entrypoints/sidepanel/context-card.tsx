import { X } from "lucide-react";
import type { ReactNode } from "react";
import { Button, IconTooltip } from "../../src/ui/components";
import { useDeferredRemove } from "./use-deferred-remove";

// A composer context card: what will be sent with the message (a tab, a file,
// a skill, a selected element or text), with a button to remove it. Title
// and detail truncate to one line, so each carries its full text as a
// tooltip; `fullTitle` is the title's full text when the title is shortened.
export function ContextCard({
  icon,
  title,
  fullTitle = title,
  detail,
  removeLabel,
  onRemove,
}: {
  icon: ReactNode;
  title: string;
  fullTitle?: string;
  detail: string;
  removeLabel: string;
  onRemove: () => void;
}) {
  const { removing, remove } = useDeferredRemove(onRemove);
  return (
    <div className={`context-card ${removing ? "is-removing" : ""}`}>
      {icon}
      <span>
        <strong title={fullTitle}>{title}</strong>
        <small title={detail}>{detail}</small>
      </span>
      <IconTooltip label={removeLabel}>
        <Button
          variant="ghost"
          size="icon"
          className="context-close"
          aria-label={removeLabel}
          onClick={remove}
        >
          <X size={14} />
        </Button>
      </IconTooltip>
    </div>
  );
}
