import {
  redactStrings,
  typedFingerprint,
  typedForm,
} from "../shared/teach/redact";
import type { TeachPageConfig } from "../shared/teach/page-protocol";

// What the user typed in this document, kept only in this script's memory,
// so nothing the recorder reports carries it, not even where the page
// echoes it (see shared/teach/redact.ts). Values typed on the recording's
// earlier pages are known by their fingerprints only.
export function typedValues(earlier: TeachPageConfig["typed"]) {
  const forms = new Set<string>();
  // Fingerprints of values not reported yet.
  let added: string[] = [];
  return {
    // A value the user typed; a secret one is redacted in this document
    // only and gets no fingerprint.
    add(value: string, secret: boolean) {
      const form = typedForm(value);
      if (!form || forms.has(form)) return;
      forms.add(form);
      if (!secret) added.push(typedFingerprint(earlier.key, value));
    },
    redact<T>(value: T): T {
      return redactStrings(value, {
        forms: [...forms],
        key: earlier.key,
        fingerprints: earlier.fingerprints,
      });
    },
    // The fingerprints to report with the next step.
    take() {
      const taken = added;
      added = [];
      return taken;
    },
    clear() {
      forms.clear();
      added = [];
    },
  };
}
