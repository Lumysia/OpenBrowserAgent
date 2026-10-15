import * as React from "react";
import { cn } from "../utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn("ui-input", className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn("ui-textarea", className)} {...props} />
));
Textarea.displayName = "Textarea";

// A draft of a saved text value, saved when editing ends (leaving the field,
// or Enter in a one-line field); Escape restores the saved value.
function useCommitDraft(
  value: string,
  onCommit: (value: string) => void,
  commitOnEnter: boolean,
) {
  const [draft, setDraft] = React.useState(value);
  React.useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  return {
    value: draft,
    onChange: (event: { target: { value: string } }) =>
      setDraft(event.target.value),
    onBlur: commit,
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === "Enter" && commitOnEnter) commit();
      if (event.key === "Escape") setDraft(value);
    },
  };
}

type CommitProps<T> = Omit<T, "value" | "defaultValue" | "onChange"> & {
  value: string;
  onCommit: (value: string) => void;
};

// A text field saved when editing ends, not on every keystroke: settings
// that sync are written once per edit.
export const CommitInput = React.forwardRef<
  HTMLInputElement,
  CommitProps<React.InputHTMLAttributes<HTMLInputElement>>
>(({ value, onCommit, onBlur, onKeyDown, ...props }, ref) => {
  const draft = useCommitDraft(value, onCommit, true);
  return (
    <Input
      ref={ref}
      {...props}
      {...draft}
      onBlur={(event) => {
        draft.onBlur();
        onBlur?.(event);
      }}
      onKeyDown={(event) => {
        draft.onKeyDown(event);
        onKeyDown?.(event);
      }}
    />
  );
});
CommitInput.displayName = "CommitInput";

export const CommitTextarea = React.forwardRef<
  HTMLTextAreaElement,
  CommitProps<React.TextareaHTMLAttributes<HTMLTextAreaElement>>
>(({ value, onCommit, onBlur, onKeyDown, ...props }, ref) => {
  const draft = useCommitDraft(value, onCommit, false);
  return (
    <Textarea
      ref={ref}
      {...props}
      {...draft}
      onBlur={(event) => {
        draft.onBlur();
        onBlur?.(event);
      }}
      onKeyDown={(event) => {
        draft.onKeyDown(event);
        onKeyDown?.(event);
      }}
    />
  );
});
CommitTextarea.displayName = "CommitTextarea";
