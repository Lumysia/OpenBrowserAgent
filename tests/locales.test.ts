import assert from "node:assert/strict";
import { test } from "node:test";
import { BUILTIN_SKILLS } from "../src/shared/builtin-skills";
import { i18nRegistry } from "../src/shared/i18n";

const PLURAL_FORMS = new Set(["zero", "one", "two", "few", "many", "other"]);

function isPlural(value: object) {
  const entries = Object.entries(value);
  return (
    typeof (value as { other?: unknown }).other === "string" &&
    entries.every(
      ([key, item]) => PLURAL_FORMS.has(key) && typeof item === "string",
    )
  );
}

// Every message path, with plural messages as one entry each.
function messagePaths(value: unknown, path = ""): Map<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    isPlural(value)
  )
    return new Map([[path, value]]);
  return new Map(
    Object.entries(value).flatMap(([key, item]) => [
      ...messagePaths(item, path ? `${path}.${key}` : key),
    ]),
  );
}

const english = messagePaths(i18nRegistry["en-US"]);

test("every locale has every message of en-US and no others", () => {
  for (const [language, messages] of Object.entries(i18nRegistry)) {
    const paths = messagePaths(messages);
    assert.deepEqual(
      [...paths.keys()].sort(),
      [...english.keys()].sort(),
      language,
    );
    for (const [path, value] of paths) {
      const source = english.get(path);
      const kind = (item: unknown) =>
        Array.isArray(item)
          ? "array"
          : item && typeof item === "object"
            ? "plural"
            : typeof item;
      assert.equal(kind(value), kind(source), `${language} ${path}`);
      if (typeof value === "string")
        assert.ok(value.trim(), `${language} ${path} is empty`);
    }
  }
});

test("every plural message has an `other` form and keeps {count}", () => {
  for (const [language, messages] of Object.entries(i18nRegistry))
    for (const [path, value] of messagePaths(messages)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      for (const form of Object.values(value))
        assert.match(form, /\{count\}/, `${language} ${path}`);
    }
});

test("every locale names and describes every built-in skill", () => {
  const names = BUILTIN_SKILLS.map((skill) => skill.name).sort();
  for (const [language, messages] of Object.entries(i18nRegistry)) {
    const texts = messages.display.builtinSkills;
    assert.deepEqual(Object.keys(texts).sort(), names, language);
    for (const [name, text] of Object.entries(texts)) {
      assert.ok(text.name.trim(), `${language} ${name}`);
      assert.ok(text.description.trim(), `${language} ${name}`);
    }
  }
});

test("Chinese questions use the full-width question mark", () => {
  for (const language of ["zh-CN", "zh-TW"])
    for (const [path, value] of messagePaths(i18nRegistry[language])) {
      const texts =
        typeof value === "string"
          ? [value]
          : value && typeof value === "object"
            ? Object.values(value)
            : [];
      for (const text of texts)
        assert.doesNotMatch(
          String(text),
          /\p{Script=Han}[^?]*\?|\?[^?]*\p{Script=Han}/u,
          `${language} ${path}`,
        );
    }
});
