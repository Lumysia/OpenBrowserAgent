import assert from "node:assert/strict";
import { test } from "node:test";
import { mcpResultSources } from "../src/shared/mcp-sources";

const sources = (result: unknown) =>
  mcpResultSources({ result }).map(({ title, url, snippet }) => ({
    title,
    url,
    ...(snippet ? { snippet } : {}),
  }));
const text = (value: string) => ({ content: [{ type: "text", text: value }] });

test("resource links and embedded resources are sources", () => {
  assert.deepEqual(
    sources({
      content: [
        {
          type: "resource_link",
          uri: "https://a.example/",
          name: "a",
          title: "Page A",
          description: "About A.",
        },
        {
          type: "resource",
          resource: { uri: "https://b.example/", text: "Body of B." },
        },
        { type: "resource_link", uri: "file:///etc/passwd", name: "local" },
      ],
    }),
    [
      { title: "Page A", url: "https://a.example/", snippet: "About A." },
      {
        title: "https://b.example/",
        url: "https://b.example/",
        snippet: "Body of B.",
      },
    ],
  );
});

test("structured content lists its results with URLs, whatever the list is called", () => {
  assert.deepEqual(
    sources({
      content: [],
      structuredContent: {
        hits: [
          { link: "https://a.example/", name: "A", summary: "Sum." },
          { id: 2 },
        ],
        total: 1,
      },
    }),
    [{ title: "A", url: "https://a.example/", snippet: "Sum." }],
  );
});

test("each line that holds one link is a result, titled by the line above it", () => {
  const result = text(
    [
      "Title: First result",
      "URL: https://one.example/a",
      "Published: 2024-05-01",
      "Highlights:",
      "The first page says something long enough to keep as its snippet text.",
      "",
      "---",
      "",
      "# Second result",
      "https://two.example/b",
      "Second text.",
      "",
      "- [Third](https://three.example/)",
      "- <https://four.example/>",
    ].join("\n"),
  );
  assert.deepEqual(sources(result), [
    {
      title: "First result",
      url: "https://one.example/a",
      snippet:
        "The first page says something long enough to keep as its snippet text.",
    },
    {
      title: "Second result",
      url: "https://two.example/b",
      snippet: "Second text.",
    },
    { title: "Third", url: "https://three.example/" },
    { title: "https://four.example/", url: "https://four.example/" },
  ]);
});

test("links inside prose are not sources, and a page found twice is one source", () => {
  assert.deepEqual(
    sources(
      text(
        "See https://inline.example/ and [this](https://md.example/) for more.",
      ),
    ),
    [],
  );
  assert.equal(
    sources({
      content: [
        { type: "text", text: "https://same.example/" },
        { type: "resource_link", uri: "https://same.example/", name: "s" },
      ],
    }).length,
    1,
  );
});
