import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { typingPhrases } from "../../src/shared/holidays";
import { useHoliday } from "./holiday-touches";
import { UI_STATE, stateWhen } from "../../src/ui/ui-state";
import { useMessages } from "../../src/ui/messages";

const TYPING_PHRASE_INTERVAL_MS = 2_000;

export function TypingIndicator({ removing = false }: { removing?: boolean }) {
  const t = useMessages();
  const holiday = useHoliday();
  const phrases = typingPhrases(
    t.sidepanel.typingPhrases,
    holiday && t.themes.holidays[holiday.id].phrases,
  );
  const [index, setIndex] = useState(0);
  const phrase = phrases[index % phrases.length] || "";

  useEffect(() => {
    if (phrases.length <= 1) return;
    const timer = setInterval(
      () => setIndex((current) => (current + 1) % phrases.length),
      TYPING_PHRASE_INTERVAL_MS,
    );
    return () => clearInterval(timer);
  }, [phrases.length]);

  return (
    <span
      className="typing-indicator"
      data-state={stateWhen(removing, UI_STATE.removing)}
      aria-label={phrase}
    >
      <span className="typing-indicator-icon" aria-hidden="true">
        <Sparkles size={15} />
      </span>
      <span className="typing-phrase-window" aria-hidden="true">
        <span key={phrase} className="typing-phrase">
          {phrase}
        </span>
      </span>
    </span>
  );
}
