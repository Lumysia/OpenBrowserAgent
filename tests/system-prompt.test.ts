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

test("the system prompt says to extract a few facts before reading a long page", () => {
  const system = createSystemPrompt({
    agent: DEFAULT_AGENT,
    skills: [],
    bridges: 0,
  });
  const line = system
    .split("\n")
    .find((item) => item.includes("call extract first"));
  assert.ok(line, "the extract rule is in the prompt");
  assert.match(
    line,
    /only a few facts from a long page, call extract first instead of reading or snapshotting it, since every page read fills the context/,
  );
  assert.match(
    line,
    /Trust its answer and quoted evidence instead of reading the same page again/,
  );
  assert.match(
    line,
    /read or snapshot it afterwards only if extract says the page does not answer, or you need the layout or to interact/,
  );
  assert.match(line, /Write the extract question in the user's language/);
});

test("agents without page tools get no extract rule", () => {
  const system = createSystemPrompt({
    agent: { ...DEFAULT_AGENT, toolGroups: [] },
    skills: [],
    bridges: 0,
  });
  assert.doesNotMatch(system, /call extract first/);
});
