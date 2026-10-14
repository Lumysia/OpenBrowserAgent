import assert from "node:assert/strict";
import { test } from "node:test";
import { getMessages } from "../src/shared/i18n";
import { BUILTIN_MCP_SERVERS } from "../src/shared/mcp";
import { USER_ERROR_CODE, UserError } from "../src/shared/user-errors";
import {
  WORKSPACE_ERROR_TEXT,
  type WorkspaceErrorCode,
} from "../src/shared/workspace-errors";
import { errorWithDetail } from "../src/ui/error-text";
import { workspaceErrorText } from "../entrypoints/options/workspace-error-text";
import { mcpServerDescription } from "../src/ui/mcp-display";
import {
  modelNameDisplay,
  providerNameDisplay,
} from "../src/ui/provider-display";

const zh = getMessages("zh-CN");
getMessages("en-US");

test("default provider names show in the UI language, chosen ones as typed", () => {
  assert.equal(providerNameDisplay("OpenAI-compatible", zh), "OpenAI 兼容");
  assert.equal(providerNameDisplay("My OpenAI", zh), "My OpenAI");
  assert.equal(providerNameDisplay("OpenRouter", zh), "OpenRouter");
  assert.equal(providerNameDisplay("Gemini-compatible", zh), "Gemini 兼容");
  // Default names stored by older versions follow the new wording too.
  assert.equal(providerNameDisplay("Ollama", zh), "Ollama 兼容");
  assert.equal(
    providerNameDisplay("OpenAI Responses", zh),
    "OpenAI Responses 兼容",
  );
  assert.equal(
    modelNameDisplay("Anthropic-compatible / claude / v2", zh),
    "Anthropic 兼容 / claude / v2",
  );
  assert.equal(modelNameDisplay("gpt-5", zh), "gpt-5");
});

test("built-in MCP servers keep a localized description until edited", () => {
  const [exa] = BUILTIN_MCP_SERVERS;
  assert.equal(mcpServerDescription(exa, zh), zh.display.builtinMcpServers.exa);
  assert.equal(
    mcpServerDescription({ ...exa, description: "Mine" }, zh),
    "Mine",
  );
  for (const server of BUILTIN_MCP_SERVERS)
    assert.ok(
      Object.hasOwn(zh.display.builtinMcpServers, server.name),
      server.name,
    );
});

test("errors show a localized lead and our own reasons localized", () => {
  assert.equal(
    errorWithDetail(zh.options.fetchModelsError, new Error("HTTP 401"), zh),
    "无法加载模型：HTTP 401",
  );
  assert.equal(
    errorWithDetail(
      zh.options.fetchModelsError,
      new UserError(USER_ERROR_CODE.baseUrlRequired, "Base URL is required"),
      zh,
    ),
    "无法加载模型：请输入 Base URL。",
  );
  assert.equal(
    errorWithDetail(zh.options.debugResetError, new Error(""), zh),
    "无法清除数据",
  );
});

test("workspace errors in the settings name the limit in the UI language", () => {
  const de = getMessages("de-DE");
  try {
    const text = workspaceErrorText("workspaceTooLarge", de);
    assert.match(text, /\d\.\d{3}/);
    assert.doesNotMatch(text, /\{limit\}/);
    for (const code of Object.keys(
      WORKSPACE_ERROR_TEXT,
    ) as WorkspaceErrorCode[])
      assert.ok(workspaceErrorText(code, zh).trim(), code);
  } finally {
    getMessages("en-US");
  }
});
