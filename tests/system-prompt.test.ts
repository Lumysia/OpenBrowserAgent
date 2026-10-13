import assert from "node:assert/strict";
import test from "node:test";
import { createSystemPrompt } from "../src/background/system-prompt";
import { DEFAULT_AGENT } from "../src/shared/agents";

test("the system prompt asks with choices when a missing detail changes the result", () => {
  const system = createSystemPrompt({
    agent: DEFAULT_AGENT,
    skills: [],
    bridges: 0,
  });
  const rules = system.slice(
    system.indexOf("<rules>"),
    system.indexOf("</rules>"),
  );
  assert.match(
    rules,
    /missing detail would change what you do or recommend.*call ask with choices before doing the work/,
  );
  assert.match(rules, /pick a sensible default and say which one you picked/);
  assert.match(rules, /Don't ask about minor preferences/);
  assert.match(
    rules,
    /don't end a reply with a question ask could have offered/,
  );
});
