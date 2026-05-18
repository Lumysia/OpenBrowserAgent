import { Sparkles } from "lucide-react";
import type { Messages } from "../../src/shared/i18n";

export function TypingIndicator({ t }: { t: Messages }) {
  const phrases = t.sidepanel.typingPhrases;
  return (
    <span className="typing-indicator" aria-label={phrases[0]}>
      <span className="typing-indicator-icon" aria-hidden="true">
        <Sparkles size={15} />
      </span>
      <span className="typing-phrase-window" aria-hidden="true">
        {phrases.map((phrase) => (
          <span key={phrase} className="typing-phrase">
            {phrase}
          </span>
        ))}
      </span>
    </span>
  );
}
