import assert from "node:assert/strict";
import { before, test } from "node:test";
import ng from "@jitl/quickjs-ng-wasmfile-release-sync";
import {
  newQuickJSWASMModuleFromVariant,
  type QuickJSWASMModule,
} from "quickjs-emscripten-core";
import { createAgentDraft } from "../src/shared/agents";
import { runJavaScript } from "../src/shared/code-sandbox/engine";
import type { OffscreenRunCodeRequest } from "../src/shared/offscreen";
import { storage } from "../src/shared/storage";
import { TOOL_NAME } from "../src/shared/tool-names";
import type { AgentWorkspace } from "../src/shared/types";
import { BUILTIN_TOOLS, readingTool } from "../src/background/tools/registry";
import type { RunContext, ToolContext } from "../src/background/tools/types";
import { installChrome } from "./fake-chrome";

// A read-only (unattended) run may only look: tools whose effects depend on
// the run, such as runCode's saved files, change nothing there.

let quickjs: QuickJSWASMModule;
before(async () => {
  quickjs = await newQuickJSWASMModuleFromVariant(ng);
});

const AGENT = { ...createAgentDraft("Notes"), id: "notes" };

// The offscreen document, answered in process by the real interpreter.
function installSandbox() {
  installChrome({
    runtime: {
      getURL: (path: string) => `chrome-extension://test${path}`,
      getManifest: () => ({}),
      getContexts: async () => [{}],
      ContextType: { OFFSCREEN_DOCUMENT: "OFFSCREEN_DOCUMENT" },
      sendMessage: async (message: OffscreenRunCodeRequest) => ({
        ok: true,
        value: runJavaScript(quickjs, message.request),
      }),
    },
  });
}

async function runCodeIn(readOnly: boolean | undefined) {
  installSandbox();
  const workspace: AgentWorkspace = {
    agentId: AGENT.id,
    files: [{ path: "MEMORY.md", content: "old", updatedAt: 0 }],
    createdAt: 0,
    updatedAt: 0,
  } as AgentWorkspace;
  await storage.agentWorkspaces.replace([workspace]);
  const run = {
    agent: AGENT,
    workspace: structuredClone(workspace),
    unattended:
      readOnly === undefined
        ? undefined
        : { readOnly, needsUser: () => {}, report: () => {} },
  } as unknown as RunContext;
  const tool = BUILTIN_TOOLS.find((item) => item.name === TOOL_NAME.runCode)!;
  const offered = readOnly ? readingTool(tool) : tool;
  assert.ok(offered, "runCode is offered");
  const result = await offered.execute(
    { code: `writeFile("MEMORY.md", "planted"); 1` },
    { run, toolCallId: "call" } as ToolContext,
  );
  const [stored] = await storage.agentWorkspaces.get();
  return {
    result,
    description: offered.description,
    memory: stored.files.find((file) => file.path === "MEMORY.md")?.content,
  };
}

test("runCode in a read-only run computes but cannot write the workspace", async () => {
  const { result, memory, description } = await runCodeIn(true);
  assert.equal(memory, "old");
  assert.equal(result.isError, true);
  assert.match(result.text, /writeFile is not available/);
  assert.match(description, /writeFile is not available/);
});

test("runCode in an attended run and in a run that may act still saves files", async () => {
  assert.equal((await runCodeIn(undefined)).memory, "planted");
  assert.equal((await runCodeIn(false)).memory, "planted");
});
