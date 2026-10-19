import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addNavigation,
  addTeachStep,
  currentPage,
} from "../src/shared/teach/steps";
import {
  TEACH_LIMITS,
  type TeachEvent,
  type TeachStep,
} from "../src/shared/teach/types";
import {
  cleanUrl,
  hostOf,
  stableAttribute,
  urlPattern,
} from "../src/shared/teach/urls";

const page = { title: "Form", url: "https://app.test/form" };
const button = { role: "button", name: "Save", tag: "button" };
const email = { role: "textbox", name: "Email", tag: "input", label: "Email" };

let clock = 1_000;
const event = (partial: Partial<TeachEvent>): TeachEvent => ({
  id: crypto.randomUUID(),
  kind: "click",
  at: (clock += 1_000),
  page,
  ...partial,
});

function record(events: TeachEvent[]) {
  return events.reduce<TeachStep[]>(
    (steps, item) =>
      item.kind === "navigate"
        ? addNavigation(steps, item).steps
        : addTeachStep(steps, item).steps,
    [],
  );
}

test("URLs keep origin and path only", () => {
  assert.equal(
    cleanUrl("https://user:secret@app.test/a/b?token=1#frag"),
    "https://app.test/a/b",
  );
  assert.equal(cleanUrl("javascript:alert(1)"), "");
  assert.equal(cleanUrl("not a url"), "");
  assert.equal(hostOf("https://app.test:8080/x?y"), "app.test:8080");
});

test("URL patterns replace record ids with *", () => {
  assert.equal(
    urlPattern("https://shop.test/orders/12345/edit?x=1"),
    "https://shop.test/orders/*/edit",
  );
  assert.equal(
    urlPattern("https://shop.test/items/3f2b8c1e-9a0d-4c1b-8e2f-0a1b2c3d4e5f"),
    "https://shop.test/items/*",
  );
  assert.equal(
    urlPattern("https://shop.test/timesheet/week"),
    "https://shop.test/timesheet/week",
  );
});

test("generated ids are skipped, meaningful ones kept", () => {
  for (const id of [
    ":r1:",
    "«r3»",
    "ember123",
    "input-4821",
    "3f2b8c1e",
    "x7f3k9",
    "mat-input-0a9f3c",
  ])
    assert.equal(stableAttribute(id), "", id);
  for (const id of ["email", "first-name", "step2", "user_email", "h1"])
    assert.equal(stableAttribute(id), id, id);
});

test("a repeated action within the duplicate window is one step", () => {
  const first = event({ target: button });
  const again = { ...first, id: "x", at: first.at + TEACH_LIMITS.duplicateMs };
  assert.equal(record([first, again]).length, 1);
  const later = { ...again, at: first.at + TEACH_LIMITS.duplicateMs + 1 };
  assert.equal(record([first, later]).length, 2);
});

test("a field committed twice keeps one entry, and Enter submits it", () => {
  const field = (length: number) =>
    event({
      kind: "field",
      target: email,
      field: { inputType: "email", length, secret: false },
    });
  const steps = record([
    field(3),
    field(12),
    event({ kind: "key", key: "Enter", target: email }),
  ]);
  assert.equal(steps.length, 1);
  assert.equal(steps[0].field?.length, 12);
  assert.equal(steps[0].field?.submitted, true);
});

test("a navigation a click caused is the click's result", () => {
  const click = event({ target: button });
  const steps = record([
    click,
    event({
      kind: "navigate",
      at: click.at + 500,
      page: { title: "Done", url: "https://app.test/done" },
    }),
  ]);
  assert.equal(steps.length, 1);
  assert.equal(steps[0].leadsTo, "https://app.test/done");
  assert.equal(currentPage(steps, page.url), "https://app.test/done");
});

test("a navigation the user made on their own is a step", () => {
  const click = event({ target: button });
  const steps = record([
    click,
    event({
      kind: "navigate",
      at: click.at + TEACH_LIMITS.causedNavigationMs + 1,
      page: { title: "Other", url: "https://app.test/other" },
    }),
  ]);
  assert.deepEqual(
    steps.map((step) => step.kind),
    ["click", "navigate"],
  );
  // The same page again is not another step.
  assert.equal(
    addNavigation(steps, event({ kind: "navigate", page: steps[1].page })).steps
      .length,
    2,
  );
});

test("typing without submitting does not swallow a navigation", () => {
  const steps = record([
    event({
      kind: "field",
      target: email,
      field: { inputType: "email", length: 4, secret: false },
    }),
    event({ kind: "navigate", page: { title: "", url: "https://app.test/x" } }),
  ]);
  assert.equal(steps.length, 2);
});

test("a full recording drops further steps", () => {
  let steps: TeachStep[] = [];
  let dropped = 0;
  for (let index = 0; index < TEACH_LIMITS.maxSteps + 5; index += 1) {
    const change = addTeachStep(
      steps,
      event({ target: { ...button, name: `Save ${index}` } }),
    );
    steps = change.steps;
    if (change.dropped) dropped += 1;
  }
  assert.equal(steps.length, TEACH_LIMITS.maxSteps);
  assert.equal(dropped, 5);
});

test("switching to the same other site twice is one step", () => {
  const steps = record([
    event({ kind: "switchTab", site: "mail.test" }),
    event({ kind: "switchTab", site: "mail.test" }),
  ]);
  assert.equal(steps.length, 1);
});
