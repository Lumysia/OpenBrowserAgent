import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import type { Messages } from "../../src/shared/i18n";

const TYPING_PHRASE_INTERVAL_MS = 2_000;

export function TypingIndicator({
  t,
  removing = false,
}: {
  t: Messages;
  removing?: boolean;
}) {
  const phrases = t.sidepanel.typingPhrases;
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
      className={`typing-indicator${removing ? " is-removing" : ""}`}
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
