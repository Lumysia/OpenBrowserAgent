import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { PAGE_SCRIPT } from "../src/shared/page-scripts";

// Where each built path comes from: a WXT content script entrypoint (a
// file or a directory), an unlisted script, or a public file.
function sources(path: string) {
  const content = path.match(/^content-scripts\/(.+)\.js$/)?.[1];
  if (content)
    return [
      `entrypoints/${content}.content.ts`,
      `entrypoints/${content}.content`,
      `public/${path}`,
    ];
  return [`entrypoints${path.replace(/\.js$/, ".ts")}`, `public${path}`];
}

test("every page script path is one the build produces", () => {
  for (const [name, path] of Object.entries(PAGE_SCRIPT))
    assert.ok(
      sources(path).some((source) => existsSync(source)),
      `${name}: nothing builds ${path}`,
    );
});
