// The selected text's language, as the bar knows it before asking a model.
import { languageDetect } from "../../shared/language-detector";
import {
  textLanguage,
  type DetectLanguage,
} from "../../shared/speech-language";
import { selectionLanguage, type SelectionSnapshot } from "../selection";

// How long a run waits in all for the detector, which is created on first
// use in the frame, before it goes on without it.
const DETECT_WAIT_MS = 800;

// One detector for the frame, created when first needed.
export const detectLanguage = languageDetect();

function detectUntil(deadline: number): DetectLanguage {
  return (text) =>
    Promise.race([
      detectLanguage(text),
      new Promise<undefined>((resolve) =>
        setTimeout(() => resolve(undefined), deadline - Date.now()),
      ),
    ]);
}

// Undefined when the text's language could only be guessed.
export function selectedTextLanguage(snapshot: SelectionSnapshot) {
  return textLanguage(
    snapshot.text,
    selectionLanguage(snapshot),
    detectUntil(Date.now() + DETECT_WAIT_MS),
  );
}
