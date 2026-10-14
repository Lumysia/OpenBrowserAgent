// Reads text aloud with the browser's own voices (Web Speech API): no
// permission, no network request from the extension. The page shares this
// frame's speech queue, so it can tell that something is spoken, or stop it,
// but it can't read the text.
import type { SpeechPiece } from "../shared/speech-language";
import { chooseVoice, missingVoiceLanguages } from "../shared/speech-voices";

// Voices load after the page; how long to wait for the list when it's empty.
const VOICES_WAIT_MS = 1000;

let current: { stop: () => void } | undefined;

export type SpeakOptions = {
  // Runs once when reading finishes, fails or is stopped.
  onEnd: () => void;
  // Languages no installed voice reads, once per read.
  onMissingVoices?: (languages: string[]) => void;
};

// Starts reading the pieces `plan` resolves to, each in its own language,
// replacing anything this frame reads. Returns the stop function.
export function speak(
  plan: () => Promise<SpeechPiece[]>,
  { onEnd, onMissingVoices }: SpeakOptions,
) {
  const synthesis = globalThis.speechSynthesis;
  current?.stop();
  if (!synthesis) {
    onEnd();
    return () => undefined;
  }
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    if (current === handle) current = undefined;
    onEnd();
  };
  const handle = {
    stop: () => {
      if (done) return;
      finish();
      synthesis.cancel();
    },
  };
  current = handle;
  // Starts now, not after what the page queued.
  synthesis.cancel();
  Promise.all([plan(), loadVoices(synthesis)]).then(([pieces, voices]) => {
    if (done) return;
    if (!pieces.length) return finish();
    const missing = missingVoiceLanguages(
      voices,
      pieces.map(({ lang }) => lang),
    );
    if (missing.length) onMissingVoices?.(missing);
    pieces.forEach(({ text, lang }, index) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      const voice = chooseVoice(voices, lang);
      if (voice) utterance.voice = voice;
      utterance.addEventListener("error", finish);
      if (index === pieces.length - 1)
        utterance.addEventListener("end", finish);
      synthesis.speak(utterance);
    });
  }, finish);
  return handle.stop;
}

function loadVoices(synthesis: SpeechSynthesis) {
  const voices = synthesis.getVoices();
  if (voices.length) return Promise.resolve(voices);
  return new Promise<SpeechSynthesisVoice[]>((resolve) => {
    const loaded = () => {
      clearTimeout(timer);
      synthesis.removeEventListener("voiceschanged", loaded);
      resolve(synthesis.getVoices());
    };
    const timer = setTimeout(loaded, VOICES_WAIT_MS);
    synthesis.addEventListener("voiceschanged", loaded);
  });
}
