import assert from "node:assert/strict";
import { test } from "node:test";
import {
  pageOutcomeLines,
  type PageOutcome,
} from "../src/background/tools/act-report";

const outcome = (change: Partial<PageOutcome>): PageOutcome => ({
  newPage: false,
  loading: false,
  urlChanged: false,
  title: "Home",
  url: "https://ha.test/config/integrations",
  changes: [],
  otherwiseReported: false,
  ...change,
});

test("a new page is reported as one, never as no visible change", () => {
  assert.deepEqual(
    pageOutcomeLines(outcome({ newPage: true, urlChanged: true })),
    [
      "New page: Home | https://ha.test/config/integrations. Refs from before are gone: take a snapshot.",
    ],
  );
  const loading = pageOutcomeLines(
    outcome({ newPage: true, loading: true, urlChanged: true }),
  );
  assert.deepEqual(loading, [
    "New page still loading: https://ha.test/config/integrations. Refs from before are gone: take a snapshot when it has loaded.",
  ]);
  const pending = pageOutcomeLines(
    outcome({ loading: true, pendingUrl: "https://ha.test/auth/authorize" }),
  );
  assert.deepEqual(pending, [
    "Navigating to https://ha.test/auth/authorize, still loading. Take a snapshot when it has loaded; refs from before will be gone.",
  ]);
  for (const lines of [loading, pending])
    assert.ok(!lines.join("\n").includes("No visible change"));
});

test("a route change says the URL changed and whether the viewport did", () => {
  assert.deepEqual(
    pageOutcomeLines(
      outcome({
        urlChanged: true,
        changes: ["New text:", "- heading: Integrations"],
      }),
    ),
    [
      "Same page, new URL: Home | https://ha.test/config/integrations. Refs still work.",
      "New text:",
      "- heading: Integrations",
    ],
  );
  const quiet = pageOutcomeLines(outcome({ urlChanged: true, loading: true }));
  assert.equal(
    quiet[1],
    "Nothing in the viewport changed yet and the page is still loading: wait for the text you expect, or take a snapshot.",
  );
  assert.ok(!quiet.join("\n").includes("No visible change"));
});

test("without navigation, no change is said only when nothing else answers", () => {
  assert.deepEqual(pageOutcomeLines(outcome({})), [
    "No visible change in the viewport, and no navigation. Check with snapshot or find if you expected one.",
  ]);
  assert.deepEqual(pageOutcomeLines(outcome({ otherwiseReported: true })), []);
  assert.deepEqual(
    pageOutcomeLines(outcome({ changes: ['Gone: button "Save"'] })),
    ['Gone: button "Save"'],
  );
});
