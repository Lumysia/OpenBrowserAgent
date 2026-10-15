import assert from "node:assert/strict";
import { test } from "node:test";
import { CAPTION_FILE_LIMITS } from "../src/shared/video-subtitles/cues";
import { parseCaptionFile } from "../src/shared/video-subtitles/formats";

test("WebVTT: cues, markup, NOTE blocks and inline word times", () => {
  const file = parseCaptionFile(
    [
      "WEBVTT Kind: captions",
      "",
      "NOTE written for the test",
      "",
      "intro",
      "00:00:01.000 --> 00:00:02.500 line:90%",
      "<v Ana>Hello &amp; <b>welcome</b></v>",
      "to the show.",
      "",
      "00:03.000 --> 00:04.000",
      "one <00:00:03.400><c>two</c> <00:00:03.800>three",
      "",
    ].join("\n"),
  );
  assert.equal(file?.format, "webvtt");
  assert.deepEqual(
    file.cues.map(({ start, end, text }) => ({ start, end, text })),
    [
      { start: 1, end: 2.5, text: "Hello & welcome\nto the show." },
      { start: 3, end: 4, text: "one two three" },
    ],
  );
  assert.deepEqual(
    file.cues[1]!.words?.map((word) => [word.start, word.text]),
    [
      [3, "one "],
      [3.4, "two "],
      [3.8, "three"],
    ],
  );
});

test("SRT: decimal commas and position tags", () => {
  const file = parseCaptionFile(
    "1\r\n00:00:01,200 --> 00:00:02,000\r\n{\\an8}<i>Up here</i>\r\n\r\n2\r\n00:00:02,500 --> 00:00:03,000\r\nDown\r\n",
  );
  assert.equal(file?.format, "srt");
  assert.deepEqual(file.cues, [
    { start: 1.2, end: 2, text: "Up here" },
    { start: 2.5, end: 3, text: "Down" },
  ]);
});

test("TTML: clock, offset, tick and frame times; br and spans", () => {
  const file = parseCaptionFile(`<?xml version="1.0" encoding="utf-8"?>
<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttp="http://www.w3.org/ns/ttml#parameter" ttp:tickRate="10000000" ttp:frameRate="25">
  <body><div>
    <p begin="00:00:01.500" end="00:00:03.000">First<br/>line</p>
    <p begin="40000000t" dur="10000000t"><span tts:color="white">Ticks</span></p>
    <p begin="00:00:06:12" end="7s">Frames &lt;3</p>
    <p begin="9s"/>
  </div></body>
</tt>`);
  assert.equal(file?.format, "ttml");
  assert.deepEqual(file.cues, [
    { start: 1.5, end: 3, text: "First\nline" },
    { start: 4, end: 5, text: "Ticks" },
    { start: 6.48, end: 7, text: "Frames <3" },
  ]);
});

test("json3: manual cues, word-timed automatic captions, speaker marks", () => {
  const file = parseCaptionFile(
    JSON.stringify({
      wireMagic: "pb3",
      events: [
        { tStartMs: 0, dDurationMs: 9000, id: 1, wWinId: 1 },
        {
          tStartMs: 500,
          dDurationMs: 3000,
          segs: [{ utf8: ">> so" }, { utf8: " this", tOffsetMs: 300 }],
        },
        {
          tStartMs: 3400,
          dDurationMs: 100,
          aAppend: 1,
          segs: [{ utf8: "\n" }],
        },
        { tStartMs: 4000, dDurationMs: 1000, segs: [{ utf8: "Plain line" }] },
      ],
    }),
  );
  assert.equal(file?.format, "json3");
  assert.deepEqual(
    file.cues.map(({ start, end, text }) => ({ start, end, text })),
    [
      { start: 0.5, end: 3.5, text: "so this" },
      { start: 4, end: 5, text: "Plain line" },
    ],
  );
  assert.deepEqual(file.cues[0]!.words, [
    { start: 0.5, text: "so" },
    { start: 0.8, text: " this" },
  ]);
  assert.equal(file.cues[1]!.words, undefined);
});

test("files that aren't captions, or too large, are ignored", () => {
  assert.equal(parseCaptionFile('{"events": []}'), undefined);
  assert.equal(parseCaptionFile('{"tStartMs": "x"}'), undefined);
  assert.equal(parseCaptionFile("<html><body>hi</body></html>"), undefined);
  assert.equal(parseCaptionFile("WEBVTT\n\n"), undefined);
  assert.equal(parseCaptionFile(42), undefined);
  assert.equal(
    parseCaptionFile(
      "WEBVTT\n\n00:01.000 --> 00:02.000\n" +
        "x".repeat(CAPTION_FILE_LIMITS.maxChars),
    ),
    undefined,
  );
});

test("WebVTT: ruby keeps its base text; a cue that is only an annotation, and a thumbnail track, aren't captions", () => {
  const file = parseCaptionFile(
    [
      "WEBVTT",
      "",
      "00:00:00.000 --> 00:00:05.000 line:0% align:end size:15%",
      "<ruby><rt>sitename</rt></ruby>",
      "",
      "00:00:01.000 --> 00:00:03.000",
      "<ruby>漢<rp>(</rp><rt>kan</rt><rp>)</rp>字<rt>ji</ruby>を読む",
      "",
      "00:00:04.000 --> 00:00:05.000",
      "&nbsp;<i> </i>",
      "",
    ].join("\n"),
  );
  assert.deepEqual(
    file?.cues.map(({ text }) => text),
    ["漢字を読む"],
  );
  const thumbnails = [
    "WEBVTT",
    "",
    "00:00:00.000 --> 00:00:05.000",
    "preview-01.jpg#xywh=0,0,320,180",
    "",
    "00:00:05.000 --> 00:00:10.000",
    "https://cdn.example/sprites/preview-02.webp",
    "",
  ].join("\n");
  assert.equal(parseCaptionFile(thumbnails), undefined);
});

test("TTML: a ruby annotation span is left out", () => {
  const file = parseCaptionFile(
    `<?xml version="1.0"?><tt xmlns="http://www.w3.org/ns/ttml" xmlns:tts="http://www.w3.org/ns/ttml#styling"><body><div>` +
      `<p begin="00:00:01.000" end="00:00:02.000"><span tts:ruby="container"><span tts:ruby="base">漢字</span><span tts:ruby="text">かんじ</span></span>です</p>` +
      `</div></body></tt>`,
  );
  assert.deepEqual(
    file?.cues.map(({ text }) => text),
    ["漢字です"],
  );
});
