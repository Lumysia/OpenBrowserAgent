import {
  dictionaryPlainText,
  readDictionaryAnswer,
  SMART_BAR_RESULT_FORMAT,
  type DictionaryEntry,
  type DictionaryLabels,
} from "../../shared/smart-bar-dictionary";
import type { SmartBarResult } from "./store";

// A result as the card uses it. `shown` is the plain text the card shows
// when there is no entry; the rest feed the card's actions.
export type SmartBarOutput = {
  entry?: DictionaryEntry;
  // A dictionary answer is streaming but has nothing to show yet.
  pending: boolean;
  shown: string;
  // Copy and the side panel.
  copy: string;
  // Replace, Insert below and Read result aloud.
  write: string;
};

export function smartBarOutput(
  result: SmartBarResult,
  labels: DictionaryLabels,
): SmartBarOutput {
  const plain = (text: string, pending = false) => ({
    pending,
    shown: text,
    copy: text.trim(),
    write: text.trim(),
  });
  // Errors show their message, not what streamed before them.
  if (
    result.format !== SMART_BAR_RESULT_FORMAT.dictionary ||
    result.status === "error" ||
    result.status === "tooLong"
  )
    return plain(result.text);
  const reading = readDictionaryAnswer(
    result.text,
    result.status !== "streaming",
  );
  if (reading.kind === "pending") return plain("", true);
  if (reading.kind === "text") return plain(reading.text);
  const { entry } = reading;
  return {
    entry,
    pending: false,
    shown: "",
    copy: dictionaryPlainText(entry, labels),
    write: entry.translation || "",
  };
}
