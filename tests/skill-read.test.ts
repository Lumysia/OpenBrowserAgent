import assert from "node:assert/strict";
import { test } from "node:test";
import { CONTEXT_POLICY, tokenChars } from "../src/background/context/policy";
import { createToolOutputs } from "../src/background/context/tool-outputs";
import { readTool } from "../src/background/tools/read";
import type { ToolContext } from "../src/background/tools/types";
import { createSkillPackage } from "../src/shared/skills";
import { memoryArtifacts } from "./pi-runtime-helpers";

const skillOf = (body: string) =>
  createSkillPackage({ name: "long", description: "Long", instruction: body });

async function readSkill(body: string, input: Record<string, unknown> = {}) {
  const skill = skillOf(body);
  const context = { run: { skills: [skill] } } as unknown as ToolContext;
  const result = await readTool.execute(
    { source: "skill:long", ...input },
    context,
  );
  // What the model gets: read bounds its own output, so the general cap
  // must not cut it again.
  const outputs = createToolOutputs("chat", memoryArtifacts());
  const shown = await outputs.accept({
    toolCallId: "call",
    toolName: readTool.name,
    input: { source: "skill:long" },
    text: result.text,
    repeatable: false,
    bounded: readTool.boundedOutput,
  });
  return { result, shown: shown.text, total: skill.files[0].content.length };
}

test("a skill longer than the general output cap is read whole", async () => {
  const cap = tokenChars(CONTEXT_POLICY.toolOutputCapTokens);
  const body = "Step: follow this line exactly.\n".repeat(
    Math.ceil((cap * 2) / 32),
  );
  const { result, shown, total } = await readSkill(body);
  assert.ok(total > cap * 2);
  assert.equal(shown, result.text);
  assert.ok(shown.includes(body.trim()));
  assert.match(shown, new RegExp(`characters 0-${total} of ${total}; end\\]`));
  assert.doesNotMatch(shown, /truncated/i);
  assert.equal(result.details?.truncated, false);
  assert.equal(result.details?.shown, total);
});

test("a skill over the skill limit ends with a machine-readable cut note", async () => {
  const max = tokenChars(CONTEXT_POLICY.skillReadMaxTokens);
  assert.ok(max >= tokenChars(CONTEXT_POLICY.toolOutputCapTokens) * 4);
  const body = "x".repeat(max + 5_000);
  const { result, shown, total } = await readSkill(body);
  assert.equal(shown, result.text);
  assert.doesNotMatch(shown, /; end\]/);
  assert.doesNotMatch(shown, /Output truncated/);
  assert.match(shown, new RegExp(`continue with offset=${max}\\]`));
  assert.ok(
    shown.endsWith(
      `\n[Truncated: showed characters 0-${max} of ${total} of skill:long/SKILL.md. The rest is not shown: continue with read source="skill:long/SKILL.md" offset=${max}.]`,
    ),
  );
  assert.deepEqual(
    {
      truncated: result.details?.truncated,
      shown: result.details?.shown,
      chars: result.details?.chars,
    },
    { truncated: true, shown: max, chars: total },
  );

  const rest = await readSkill(body, { offset: max });
  assert.match(
    rest.shown,
    new RegExp(`characters ${max}-${total} of ${total}; end\\]`),
  );
  assert.doesNotMatch(rest.shown, /Truncated/);
});

test("other tools are still capped by the general output cap", async () => {
  const outputs = createToolOutputs("chat", memoryArtifacts());
  const text = "line\n".repeat(tokenChars(CONTEXT_POLICY.toolOutputCapTokens));
  const shown = await outputs.accept({
    toolCallId: "call",
    toolName: "snapshot",
    input: {},
    text,
    repeatable: false,
  });
  assert.match(shown.text, /\[Output truncated: showed \d+ of \d+ characters/);
});

test("reading a skill adds no citable source", async () => {
  const { result } = await readSkill("Do the thing.");
  assert.equal(result.sources, undefined);
});
