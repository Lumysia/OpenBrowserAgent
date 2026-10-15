import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyAttachment } from "../src/shared/attachments";
import {
  extensionForType,
  isHtmlType,
  isTextType,
  typeForName,
} from "../src/shared/mime";

test("one table gives types for names and extensions for types", () => {
  assert.equal(typeForName("notes.MD"), "text/markdown");
  assert.equal(typeForName("archive"), "");
  assert.equal(extensionForType("image/jpeg"), "jpg");
  assert.equal(extensionForType("image/svg+xml; charset=utf-8"), "svg");
  assert.equal(extensionForType("text/x-unknown"), "txt");
  assert.equal(extensionForType("application/octet-stream"), "");
});

test("text and HTML are recognised by type, with parameters and suffixes", () => {
  for (const type of [
    "text/plain; charset=utf-8",
    "text/x-python",
    "application/json",
    "application/ld+json",
    "application/rss+xml",
    "image/svg+xml",
  ])
    assert.ok(isTextType(type), type);
  for (const type of ["application/pdf", "image/png", "application/zip"])
    assert.ok(!isTextType(type), type);
  assert.ok(isHtmlType("text/html; charset=utf-8"));
  assert.ok(isHtmlType("application/xhtml+xml"));
  assert.ok(!isHtmlType("text/plain"));
});

test("attachments are text by their type or their name", () => {
  assert.equal(classifyAttachment("a.bin", "text/x-python"), "text");
  assert.equal(classifyAttachment("server.log", ""), "text");
  assert.equal(classifyAttachment("photo.png", "image/png"), "image");
});
