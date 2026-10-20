import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mergeFingerprints,
  MAX_FINGERPRINTS,
  newFingerprintKey,
  redactStrings,
  redactText,
  redactUrl,
  TYPED_VALUE_MARKER as MARK,
  typedFingerprint,
  typedForm,
} from "../src/shared/teach/redact";

const QUERY = "divorce lawyer near me";

test("echoes of a typed value are replaced whatever their case and spacing", () => {
  const typed = { forms: [typedForm(QUERY)] };
  assert.equal(redactText(`Search for ${QUERY}`, typed), `Search for ${MARK}`);
  assert.equal(
    redactText("DIVORCE  Lawyer-near_me - Results", typed),
    `${MARK} - Results`,
  );
  assert.equal(
    redactText(`Results for “${QUERY}” and ${QUERY}.`, typed),
    `Results for “${MARK}” and ${MARK}.`,
  );
  assert.equal(redactText("Find a lawyer", typed), "Find a lawyer");
});

test("URLs lose the path parts that echo a typed value, decoded", () => {
  const typed = { forms: [typedForm(QUERY)] };
  assert.equal(
    redactUrl("https://find.test/find/divorce-lawyer-near-me/page", typed),
    `https://find.test/find/${MARK}/page`,
  );
  assert.equal(
    redactUrl("https://find.test/q/divorce%20lawyer%20near%20me", typed),
    `https://find.test/q/${MARK}`,
  );
});

test("a redacted URL stays as it is when redacted again", () => {
  const typed = { forms: [typedForm(QUERY)] };
  const once = redactUrl(
    "https://find.test/find/divorce-lawyer-near-me",
    typed,
  );
  assert.equal(redactUrl(once, typed), once);
  assert.equal(redactUrl(once, typed), `https://find.test/find/${MARK}`);
});

test("values shorter than the minimum are not looked for", () => {
  assert.equal(typedForm("ab"), "");
  assert.equal(typedForm(" a-b "), "");
  assert.equal(redactText("ab cd", { forms: [typedForm("ab")] }), "ab cd");
});

test("fingerprints find a value typed on an earlier page, and hold no value", () => {
  const key = newFingerprintKey();
  const fingerprint = typedFingerprint(key, QUERY);
  assert.ok(!fingerprint.includes("divorce"));
  assert.notEqual(fingerprint, typedFingerprint(newFingerprintKey(), QUERY));
  const typed = { key, fingerprints: [fingerprint] };
  assert.equal(
    redactText(`${QUERY.toUpperCase()} - Results`, typed),
    `${MARK} - Results`,
  );
  assert.equal(
    redactUrl("https://find.test/find/divorce-lawyer-near-me", typed),
    `https://find.test/find/${MARK}`,
  );
  // Without the key, nothing matches.
  assert.equal(
    redactText(QUERY, {
      key: newFingerprintKey(),
      fingerprints: [fingerprint],
    }),
    QUERY,
  );
});

test("every string of a step is redacted, bookkeeping keys are not", () => {
  const typed = { forms: [typedForm("Ada Lovelace")] };
  const step = redactStrings(
    {
      id: "ada-lovelace-1",
      kind: "click",
      page: {
        title: "Hello Ada Lovelace",
        url: "https://app.test/u/ada-lovelace",
      },
      target: { role: "button", name: "Send to Ada Lovelace", tag: "button" },
      choice: "ada lovelace",
      at: 5,
    },
    typed,
  );
  assert.deepEqual(step, {
    id: "ada-lovelace-1",
    kind: "click",
    page: { title: `Hello ${MARK}`, url: `https://app.test/u/${MARK}` },
    target: { role: "button", name: `Send to ${MARK}`, tag: "button" },
    choice: MARK,
    at: 5,
  });
});

test("a recording keeps a bounded set of fingerprints", () => {
  const many = Array.from({ length: MAX_FINGERPRINTS + 5 }, (_, i) => `3:${i}`);
  const merged = mergeFingerprints(["3:a", "3:b"], [...many, "3:a"]);
  assert.equal(merged.length, MAX_FINGERPRINTS);
  assert.equal(merged.at(-1), `3:${MAX_FINGERPRINTS + 4}`);
  assert.equal(new Set(merged).size, merged.length);
});
