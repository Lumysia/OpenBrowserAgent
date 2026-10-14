import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { trimBlankLines } from "../src/shared/format";
import { UserText } from "../src/ui/components/user-text";

test("trimBlankLines keeps inner line breaks and drops outer blank lines", () => {
  assert.equal(
    trimBlankLines("\n \r\n  first\n\nsecond \n\n"),
    "  first\n\nsecond",
  );
  assert.equal(trimBlankLines("one line"), "one line");
  assert.equal(trimBlankLines("\n\n"), "");
});

test("UserText renders multi-line text with the shared pre-wrap class", () => {
  const html = renderToStaticMarkup(
    createElement(UserText, { text: "\nfirst\nsecond\n", className: "extra" }),
  );
  assert.equal(
    html,
    '<span class="ui-user-text ui-selectable extra">first\nsecond</span>',
  );
});
