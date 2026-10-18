import * as React from "react";
import { parseHexColor } from "../../shared/theme/color";
import { cn } from "../utils";
import { Feedback } from "./feedback";
import { Input } from "./input";
import { IconTooltip } from "./tooltip";

export type ColorFieldPreset = { value: string; label: string };

export type ColorFieldLabels = {
  // The swatch that opens the browser's colour picker.
  picker: string;
  // The hex code's text field.
  hex: string;
  // Shown while the typed code isn't a colour.
  invalid: string;
};

// A colour as `#rrggbb`: a swatch opening the browser's colour picker, its
// hex code to type or paste (with or without `#`, 3 or 6 digits), and quick
// presets. `onInput` follows the colour while it is being picked or typed;
// `onChange` saves it once, when the picker closes, the code is entered or
// a preset is chosen. An entered code that isn't a colour is marked and
// not saved; Escape restores the saved colour.
export function ColorField({
  label,
  value,
  presets = [],
  labels,
  onInput,
  onChange,
  className,
}: {
  // Names the field for assistive technology, e.g. the row's title.
  label: string;
  value: string;
  presets?: readonly ColorFieldPreset[];
  labels: ColorFieldLabels;
  onInput?: (value: string | undefined) => void;
  onChange: (value: string) => void;
  className?: string;
}) {
  const errorId = React.useId();
  const picker = React.useRef<HTMLInputElement>(null);
  const [draft, setDraft] = React.useState(value);
  const [picked, setPicked] = React.useState<string>();
  // Set when a code that isn't a colour was entered; typing clears it.
  const [invalid, setInvalid] = React.useState(false);
  React.useEffect(() => setDraft(value), [value]);
  const typed = parseHexColor(draft);
  const shown = picked ?? typed ?? value;

  const commit = (color: string) => {
    setPicked(undefined);
    setInvalid(false);
    setDraft(color);
    onInput?.(undefined);
    if (color !== value) onChange(color);
  };
  const commitDraft = () => {
    if (typed) commit(typed);
    else if (!draft.trim()) setDraft(value);
    else setInvalid(true);
  };

  // React's onChange on a colour input fires on every move in the picker;
  // the native change event fires once, when the picker closes.
  const latest = React.useRef(commit);
  latest.current = commit;
  React.useEffect(() => {
    const input = picker.current;
    if (!input) return;
    const changed = () => latest.current(input.value);
    input.addEventListener("change", changed);
    return () => input.removeEventListener("change", changed);
  }, []);

  return (
    <div
      role="group"
      aria-label={label}
      className={cn("ui-color-field", className)}
    >
      <div className="ui-color-field-controls">
        <label
          className="ui-color-field-swatch"
          style={{ "--color-field-value": shown } as React.CSSProperties}
        >
          <input
            ref={picker}
            type="color"
            value={shown}
            aria-label={labels.picker}
            onChange={(event) => {
              const color = event.currentTarget.value;
              setPicked(color);
              setDraft(color);
              onInput?.(color);
            }}
          />
        </label>
        <Input
          className="ui-color-field-hex"
          value={draft}
          spellCheck={false}
          autoComplete="off"
          maxLength={9}
          aria-label={labels.hex}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
          onChange={(event) => {
            const text = event.currentTarget.value;
            setDraft(text);
            setInvalid(false);
            onInput?.(parseHexColor(text));
          }}
          onBlur={commitDraft}
          onKeyDown={(event) => {
            if (event.key === "Enter") commitDraft();
            if (event.key === "Escape") {
              setDraft(value);
              setInvalid(false);
              onInput?.(undefined);
            }
          }}
        />
        {presets.length > 0 && (
          <div className="ui-color-field-presets">
            {presets.map((preset) => {
              const selected = preset.value === shown;
              return (
                <IconTooltip key={preset.value} label={preset.label}>
                  <button
                    type="button"
                    className="ui-color-field-preset"
                    style={
                      {
                        "--color-field-value": preset.value,
                      } as React.CSSProperties
                    }
                    aria-label={preset.label}
                    aria-pressed={selected}
                    onClick={() => commit(preset.value)}
                  />
                </IconTooltip>
              );
            })}
          </div>
        )}
      </div>
      {invalid && (
        <Feedback error id={errorId} className="ui-color-field-error">
          {labels.invalid}
        </Feedback>
      )}
    </div>
  );
}
