// Prints the CHANGELOG.md section for one version, for the release notes.
// Usage: node scripts/release-notes.mjs <version>
// Fails when the section is missing or empty, so a release can't go out
// without its notes.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The body of the "## <version>" section (heading line excluded), trimmed.
export function releaseNotes(changelog, version) {
  const lines = changelog.split("\n");
  const start = lines.findIndex((line) =>
    new RegExp(`^## ${escape(version)}(\\s|$)`).test(line),
  );
  if (start < 0) return "";
  const end = lines.findIndex((line, i) => i > start && /^## /.test(line));
  return lines
    .slice(start + 1, end < 0 ? undefined : end)
    .join("\n")
    .trim();
}

function escape(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const version = process.argv[2];
  if (!version) {
    console.error("Usage: node scripts/release-notes.mjs <version>");
    process.exit(2);
  }
  const changelog = readFileSync(
    new URL("../CHANGELOG.md", import.meta.url),
    "utf8",
  );
  const notes = releaseNotes(changelog, version);
  if (!notes) {
    console.error(
      `CHANGELOG.md has no notes for ${version}. Add a "## ${version}" section (rename "Unreleased") before tagging.`,
    );
    process.exit(1);
  }
  console.log(notes);
}
