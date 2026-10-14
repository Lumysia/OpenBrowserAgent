import assert from "node:assert/strict";
import { test } from "node:test";
import {
  toolDisplay,
  toolJsonDetail,
} from "../entrypoints/sidepanel/tool-part-detail";
import { actStepsSummary } from "../entrypoints/sidepanel/tool-step-summary";
import { getMessages } from "../src/shared/i18n";
import { TOOL_NAME } from "../src/shared/tool-names";
import { CHAT_PART_STATE, type ChatPart } from "../src/shared/types";

const steps = ["type", "type", "select", "select", "click"].map((action) => ({
  action,
}));

function summary(language: string, items: unknown[] = steps) {
  const t = getMessages(language);
  try {
    return actStepsSummary(items, t);
  } finally {
    getMessages("en-US");
  }
}

test("act steps are counted, grouped and joined in the UI language", () => {
  assert.equal(
    summary("en-US"),
    "Typed in 2 fields, selected 2 options, clicked 1 element",
  );
  assert.equal(
    summary("de-DE"),
    "2 Felder ausgefüllt, 2 Optionen ausgewählt, 1 Element angeklickt",
  );
  assert.equal(
    summary("zh-CN"),
    "填写了 2 个字段，选择了 2 个选项，点击了 1 个元素",
  );
  assert.equal(
    summary("ja-JP"),
    "2個の欄に入力、2個の項目を選択、1個の要素をクリック",
  );
});

test("unknown act steps are counted together, last", () => {
  assert.equal(
    summary("en-US", [{ action: "zoom" }, { action: "click" }, {}]),
    "Clicked 1 element, ran 2 other steps",
  );
  assert.equal(summary("en-US", []), "");
});

function part(input: unknown, output?: unknown): ChatPart {
  return {
    id: "part",
    type: "tool",
    state: output
      ? CHAT_PART_STATE.outputAvailable
      : CHAT_PART_STATE.inputAvailable,
    input,
    output,
  } as ChatPart;
}

test("tool steps show no raw tab ids, and keep them in the details", () => {
  const t = getMessages("en-US");
  const act = toolDisplay(
    TOOL_NAME.act,
    part({ tabId: 1928449456, steps }, { tabId: 1928449456, done: 5 }),
    t,
  );
  assert.equal(
    act.description,
    "Typed in 2 fields, selected 2 options, clicked 1 element",
  );
  const snapshot = toolDisplay(
    TOOL_NAME.snapshot,
    part({}, { tabId: 1928449456, title: "Checkout", lines: 33 }),
    t,
  );
  assert.equal(snapshot.description, "Checkout · 33 lines");
  const tabs = toolDisplay(
    TOOL_NAME.tabs,
    part({ action: "open" }, { tabId: 7, title: "Docs" }),
    t,
  );
  assert.equal(tabs.description, "Opened · Docs");
  for (const display of [act, snapshot, tabs])
    assert.doesNotMatch(display.description, /Tab \d|1928449456/);
  assert.match(
    toolJsonDetail(
      TOOL_NAME.act,
      part({ steps }, { tabId: 1928449456, done: 5 }),
    ),
    /"tabId": 1928449456/,
  );
});

test("only the act steps that ran are summarised", () => {
  const t = getMessages("en-US");
  const act = toolDisplay(
    TOOL_NAME.act,
    part({ steps }, { tabId: 1, done: 3 }),
    t,
  );
  assert.equal(act.description, "Typed in 2 fields, selected 1 option");
});

test("tool step counts are localized", () => {
  const t = getMessages("zh-CN");
  try {
    const snapshot = toolDisplay(
      TOOL_NAME.snapshot,
      part({}, { title: "结账", lines: 33 }),
      t,
    );
    assert.equal(snapshot.description, "结账 · 33 行");
    const find = toolDisplay(
      TOOL_NAME.find,
      part({ query: "价格" }, { matches: 2 }),
      t,
    );
    assert.equal(find.description, '"价格" · 2 处匹配');
  } finally {
    getMessages("en-US");
  }
});
