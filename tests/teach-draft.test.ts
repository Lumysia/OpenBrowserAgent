import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDraft } from "../src/shared/teach/skill-files";

const EXPECTED = {
  name: "submit-x",
  description: "Does x.",
  body: "## Goal\nX",
};

test("a draft is read after a preamble, in a fence, and with CRLF", () => {
  for (const reply of [
    "---\nname: submit-x\ndescription: Does x.\n---\n\n## Goal\nX",
    "Here is the skill:\n\n---\nname: submit-x\ndescription: Does x.\n---\n\n## Goal\nX",
    "```markdown\n---\nname: submit-x\ndescription: Does x.\n---\n\n## Goal\nX\n```\n",
    "Sure.\n```markdown\n---\nname: submit-x\ndescription: Does x.\n---\n\n## Goal\nX\n```",
    "---\r\nname: submit-x\r\ndescription: Does x.\r\n---\r\n\r\n## Goal\r\nX",
    'Here it is:\r\n\r\n---\r\nname: "submit-x"\r\ndescription: "Does x."\r\n---\r\n## Goal\r\nX\r\n',
  ])
    assert.deepEqual(parseDraft(reply), EXPECTED, JSON.stringify(reply));
});

test("a draft keeps code fences and rules inside its body", () => {
  const draft = parseDraft(
    "```md\n---\nname: submit-x\ndescription: Does x.\n---\n## Steps\n```js\nx()\n```\n\n---\nEnd\n```",
  );
  assert.equal(draft.name, "submit-x");
  assert.equal(draft.body, "## Steps\n```js\nx()\n```\n\n---\nEnd");
});

test("a draft without frontmatter is all body", () => {
  assert.deepEqual(parseDraft("## Goal\nX\n\n---\n\nMore\n\n---\nEnd"), {
    name: "",
    description: "",
    body: "## Goal\nX\n\n---\n\nMore\n\n---\nEnd",
  });
});
