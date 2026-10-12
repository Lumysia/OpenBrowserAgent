import { Check, FileText } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { Messages } from "../../src/shared/i18n";
import { getSkillDisplayName } from "../../src/shared/skills";
import type { PickedSkill } from "../../src/shared/types";
import { Button } from "../../src/ui/components";
import { filterSkills, slashSkillQuery } from "./skill-context";

// The skill list of the "+" menu and the "/" picker.
export function SkillPickerList({
  t,
  id,
  skills,
  selectedIds = [],
  activeIndex,
  onPick,
  onHover,
}: {
  t: Messages;
  id?: string;
  skills: PickedSkill[];
  selectedIds?: string[];
  activeIndex?: number;
  onPick: (skill: PickedSkill) => void;
  onHover?: (index: number) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (activeIndex === undefined) return;
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);
  if (!skills.length)
    return (
      <div className="composer-menu-empty">{t.sidepanel.noSkillsFound}</div>
    );
  return (
    <div
      ref={listRef}
      id={id}
      role="listbox"
      aria-label={t.options.skills}
      className="skill-picker-list"
    >
      {skills.map((skill, index) => {
        const selected = selectedIds.includes(skill.id);
        return (
          <Button
            key={skill.id}
            id={id ? `${id}-${index}` : undefined}
            data-index={index}
            role="option"
            aria-selected={
              activeIndex === undefined ? selected : activeIndex === index
            }
            variant="ghost"
            className={`action-list-item skill-picker-item ${selected || activeIndex === index ? "active" : ""}`}
            // Keep the composer focused while picking from the "/" list.
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => onHover?.(index)}
            onClick={() => onPick(skill)}
          >
            <FileText size={18} />
            <span>
              <strong>
                {getSkillDisplayName(skill, t.options.untitledSkill)}
              </strong>
              {skill.description && <small>{skill.description}</small>}
            </span>
            {selected && <Check className="menu-check" size={14} />}
          </Button>
        );
      })}
    </div>
  );
}

// "/" at the start of the composer lists the skills matching what follows
// it; arrows move, Enter or Tab picks, Escape closes.
export function useSlashSkillPicker({
  input,
  skills,
  onPick,
}: {
  input: string;
  skills: PickedSkill[];
  onPick: (skill: PickedSkill) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [dismissedInput, setDismissedInput] = useState<string>();
  const query = slashSkillQuery(input);
  const matches = query === undefined ? [] : filterSkills(skills, query);
  const open =
    query !== undefined && !!skills.length && dismissedInput !== input;
  const active = Math.min(activeIndex, Math.max(matches.length - 1, 0));

  useEffect(() => setActiveIndex(0), [query]);

  function pick(skill: PickedSkill) {
    setDismissedInput(undefined);
    onPick(skill);
  }

  // Returns whether the picker handled the key.
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!open || event.nativeEvent.isComposing) return false;
    const move = (step: number) => {
      event.preventDefault();
      if (matches.length)
        setActiveIndex((active + step + matches.length) % matches.length);
      return true;
    };
    if (event.key === "ArrowDown") return move(1);
    if (event.key === "ArrowUp") return move(-1);
    if (event.key === "Escape") {
      event.preventDefault();
      setDismissedInput(input);
      return true;
    }
    if ((event.key === "Enter" && !event.shiftKey) || event.key === "Tab") {
      if (!matches[active]) return false;
      event.preventDefault();
      pick(matches[active]);
      return true;
    }
    return false;
  }

  return {
    open,
    matches,
    activeIndex: active,
    setActiveIndex,
    pick,
    dismiss: () => setDismissedInput(input),
    onKeyDown,
  };
}
