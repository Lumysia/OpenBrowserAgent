import assert from "node:assert/strict";
import { test } from "node:test";
import { toolDisplay } from "../entrypoints/sidepanel/tool-part-detail";
import { BUILTIN_TOOLS } from "../src/background/tools/registry";
import { getMessages, i18nRegistry } from "../src/shared/i18n";
import { TOOL_NAME } from "../src/shared/tool-names";
import { CHAT_PART_STATE, type ChatPart } from "../src/shared/types";

// Each supported language once (some tags share messages).
const LANGUAGES = [
  ...new Map(
    Object.entries(i18nRegistry).map(([tag, messages]) => [messages, tag]),
  ).values(),
];

function part(input: unknown, output: unknown = {}): ChatPart {
  return {
    id: "part",
    type: "tool",
    state: CHAT_PART_STATE.outputAvailable,
    input,
    output,
  } as ChatPart;
}

// Every `action` a built-in tool accepts, from its parameter schema. act
// steps are summarized separately (see tool-step-summary.test.ts).
const toolActions = BUILTIN_TOOLS.filter(
  (tool) => tool.name !== TOOL_NAME.act,
).flatMap((tool) => {
  const properties = tool.parameters.properties as
    Record<string, { enum?: string[] }> | undefined;
  return (properties?.action?.enum || []).map(
    (action) => [tool.name, action] as const,
  );
});

test("every tool action has a step word in every language", () => {
  assert.ok(toolActions.length > 30);
  for (const language of LANGUAGES) {
    const actions: Record<string, string> =
      i18nRegistry[language].display.toolSteps.actions;
    for (const [, action] of toolActions)
      assert.ok(actions[action]?.trim(), `${action} in ${language}`);
  }
});

test("no tool step line shows a raw action name", () => {
  for (const language of LANGUAGES) {
    const t = getMessages(language);
    try {
      const actions: Record<string, string> = t.display.toolSteps.actions;
      for (const [name, action] of toolActions) {
        const { description } = toolDisplay(
          name,
          part({ action, path: "notes.md" }, { count: 2 }),
          t,
        );
        const where = `${name} ${action} in ${language}: ${description}`;
        // The localized word may contain the action ("Went back", pt-BR
        // "Consulta de status"); nothing else may.
        assert.doesNotMatch(
          description.replace(actions[action], ""),
          new RegExp(`\\b${action}\\b`, "i"),
          where,
        );
        // localCommand shows the task state; a tab list shows its count.
        if (name === TOOL_NAME.localCommand) continue;
        if (name === TOOL_NAME.tabs && action === "list")
          assert.equal(
            description,
            t.display.toolSteps.tabs.other.replace("{count}", "2"),
            where,
          );
        else assert.ok(description.startsWith(actions[action]), where);
      }
    } finally {
      getMessages("en-US");
    }
  }
});

test("local command states and loaded tools are localized", () => {
  const t = getMessages("zh-CN");
  try {
    for (const state of ["running", "done", "error", "canceled", "missing"]) {
      const { description } = toolDisplay(
        TOOL_NAME.localCommand,
        part({ action: "status" }, { state }),
        t,
      );
      assert.equal(
        description,
        (t.display.toolSteps.commandStates as Record<string, string>)[state],
      );
    }
    assert.equal(
      toolDisplay(
        TOOL_NAME.toolSearch,
        part({ names: ["workspace"] }, { loaded: ["workspace", "subAgent"] }),
        t,
      ).description,
      "2 个工具",
    );
    // An action this version does not know shows nothing, not English.
    assert.equal(
      toolDisplay(TOOL_NAME.devtools, part({ action: "trace" }), t).description,
      "",
    );
  } finally {
    getMessages("en-US");
  }
});

test("a failed step says so in the UI language, not the model's error text", () => {
  const t = getMessages("de-DE");
  try {
    const failed = {
      ...part(
        { action: "write", path: "notes.md" },
        {
          error: "Workspace file changed since it was read.",
        },
      ),
      state: CHAT_PART_STATE.outputError,
    } as ChatPart;
    assert.equal(
      toolDisplay(TOOL_NAME.workspace, failed, t).description,
      "Fehlgeschlagen",
    );
  } finally {
    getMessages("en-US");
  }
});

test("a runCode step shows its duration and saved files", () => {
  const output = { durationMs: 120, files: [{ path: "a.csv", chars: 9 }] };
  const en = getMessages("en-US");
  const english = toolDisplay(
    TOOL_NAME.runCode,
    part({ code: "1" }, output),
    en,
  );
  assert.equal(english.title, "Ran code");
  assert.equal(english.description, "120 ms · 1 file saved");
  const t = getMessages("zh-CN");
  try {
    const chinese = toolDisplay(TOOL_NAME.runCode, part({}, output), t);
    assert.equal(chinese.title, "代码已运行");
    assert.equal(chinese.description, "120毫秒 · 已保存 1 个文件");
  } finally {
    getMessages("en-US");
  }
});
