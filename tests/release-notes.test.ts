import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
// @ts-expect-error Plain ESM script without type declarations.
import { releaseNotes } from "../scripts/release-notes.mjs";

const changelog = [
  "# Changelog",
  "",
  "## Unreleased",
  "",
  "## 1.2.0-beta.1 - 2026-01-02",
  "",
  "- Beta change.",
  "",
  "## 1.2.0 - 2026-01-01",
  "",
  "Intro.",
  "",
  "### Install",
  "",
  "- Step.",
  "",
].join("\n");

test("release notes are the version's section, without its heading", () => {
  assert.equal(
    releaseNotes(changelog, "1.2.0"),
    "Intro.\n\n### Install\n\n- Step.",
  );
  assert.equal(releaseNotes(changelog, "1.2.0-beta.1"), "- Beta change.");
});

test("a version without a section or with an empty one has no notes", () => {
  assert.equal(releaseNotes(changelog, "1.3.0"), "");
  assert.equal(releaseNotes(changelog, "Unreleased"), "");
  assert.equal(releaseNotes(changelog, "1.2"), "");
});

test("the current package version has notes in CHANGELOG.md", () => {
  const { version } = JSON.parse(readFileSync("package.json", "utf8"));
  const notes = releaseNotes(readFileSync("CHANGELOG.md", "utf8"), version);
  assert.ok(notes, `CHANGELOG.md needs a "## ${version}" section`);
});
