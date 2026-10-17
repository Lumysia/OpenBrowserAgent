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

test("the system prompt asks for short progress notes between stages of a task", () => {
  const system = createSystemPrompt({
    agent: DEFAULT_AGENT,
    skills: [],
    bridges: 0,
  });
  const rules = system.slice(
    system.indexOf("<rules>"),
    system.indexOf("</rules>"),
  );
  assert.match(rules, /several steps, say in one short sentence/);
  assert.match(rules, /not before every tool call/);
  assert.match(rules, /full answer at the end/);
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

test("the system prompt cites only ids given after Cite as", () => {
  const system = createSystemPrompt({
    agent: DEFAULT_AGENT,
    skills: [],
    bridges: 0,
  });
  const line = system
    .split("\n")
    .find((item) => item.includes("[[cite:source_id]]"));
  assert.equal(
    line,
    "- Never invent URLs or facts. Cite facts from sources as [[cite:source_id]], using only ids a tool result gave after \"Cite as:\" (or listed in <sources>); never make up an id. Workspace files, skills and the user's own messages are not sources: don't cite them.",
  );
});

test("the system prompt states the run's tool step limit when there is one", () => {
  const prompt = (maxToolSteps?: number) =>
    createSystemPrompt({
      agent: DEFAULT_AGENT,
      skills: [],
      bridges: 0,
      maxToolSteps,
    });
  assert.match(
    prompt(30),
    /\n- This run may take 30 tool steps \(calls made together count as one\)\. Plan to finish within them, leaving room to check the result and answer\.\n/,
  );
  assert.doesNotMatch(prompt(0), /tool steps/);
  assert.doesNotMatch(prompt(), /tool steps/);
});

test("the system prompt says to tell the user early what the tools can't do", () => {
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
    /If your tools can't do or see something the task needs, say so plainly as soon as you know/,
  );
  assert.match(rules, /never imply you did or checked it/);
});
