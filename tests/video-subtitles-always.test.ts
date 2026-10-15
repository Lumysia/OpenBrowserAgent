import assert from "node:assert/strict";
import { test } from "node:test";
import { VIDEO_SUBTITLE_SCRIPTS } from "../src/background/video-subtitles/registration";
import { mergePreferences } from "../src/shared/default-preferences";
import {
  DEFAULT_PAGE_TRANSLATE_SETTINGS,
  normalizePageTranslateSettings,
  type PageTranslateSettings,
} from "../src/shared/page-translate/settings";
import { PAGE_SCRIPT } from "../src/shared/page-scripts";
import {
  CAPTION_READING,
  captionReading,
  isThumbnailTrack,
} from "../src/shared/video-subtitles/caption-filter";
import { CAPTION_FILE_EVENT } from "../src/shared/video-subtitles/protocol";
import {
  installCaptionObserver,
  type CaptionObserverScope,
} from "../src/video-subtitles/caption-observer";

test("subtitles are off by default, also for settings stored by earlier versions", () => {
  assert.equal(DEFAULT_PAGE_TRANSLATE_SETTINGS.videoSubtitles, false);
  // Written by 0.2.0-beta.10: the retired video button's flag, no switch.
  const stored = {
    ...DEFAULT_PAGE_TRANSLATE_SETTINGS,
    videoSubtitles: undefined,
    videoButton: true,
  } as unknown as PageTranslateSettings;
  const settings = mergePreferences({ pageTranslate: stored }).pageTranslate!;
  assert.equal(settings.videoSubtitles, false);
  assert.ok(!("videoButton" in settings));
  assert.equal(
    normalizePageTranslateSettings({ videoSubtitles: true }).videoSubtitles,
    true,
  );
  assert.equal(
    normalizePageTranslateSettings({ videoSubtitles: "yes" as never })
      .videoSubtitles,
    false,
  );
});

test("the subtitle scripts run in every frame before the page's scripts, the observer in the page's world", () => {
  assert.deepEqual(
    VIDEO_SUBTITLE_SCRIPTS.map(
      ({ file, allFrames, matchOriginAsFallback, runAt, world }) => ({
        file,
        allFrames,
        matchOriginAsFallback,
        runAt,
        world,
      }),
    ),
    [
      {
        file: PAGE_SCRIPT.videoSubtitles,
        allFrames: true,
        matchOriginAsFallback: true,
        runAt: "document_start",
        world: undefined,
      },
      {
        file: PAGE_SCRIPT.captionObserver,
        allFrames: true,
        matchOriginAsFallback: true,
        runAt: "document_start",
        world: "MAIN",
      },
    ],
  );
});

test("only responses named caption files by their type or URL are read, unnamed types peeked at", () => {
  const max = 1_000;
  const head = (url: string, type: string | null, length?: number) => ({
    url,
    type,
    length: length === undefined ? null : String(length),
  });
  for (const yes of [
    head("https://cdn.example/a/b", "text/vtt; charset=utf-8"),
    head("https://cdn.example/a/b", "application/ttml+xml"),
    head("https://cdn.example/a/b", "application/x-subrip"),
    head("https://example.com/api/timedtext?v=1&lang=en", "application/json"),
    head("https://example.com/media/en.vtt?sig=1", "text/plain"),
    head("https://example.com/player/captions/42", null),
  ])
    assert.equal(captionReading(yes, max), CAPTION_READING.read, yes.url);
  for (const unnamed of [
    head("https://cdn.example/s/en.vtt", "application/octet-stream"),
    head("https://cdn.example/s/a1b2c3", "binary/octet-stream", 900),
  ])
    assert.equal(
      captionReading(unnamed, max),
      CAPTION_READING.peek,
      unnamed.url,
    );
  for (const no of [
    head("https://example.com/api/feed", "application/json"),
    head("https://example.com/page", "text/html"),
    head("https://example.com/subscriptions", "application/json"),
    head("https://example.com/captions/clip.mp4", "video/mp4"),
    head("https://example.com/captions.vtt", "text/vtt", 5_000),
    head("https://example.com/seg-1.m4s", "application/octet-stream", 5_000),
    head("https://example.com/live.m3u8", "application/vnd.apple.mpegurl"),
    head("https://example.com/sprite.jpg", "image/jpeg"),
  ])
    assert.equal(captionReading(no, max), undefined, no.url);
});

const VTT = "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello.\n";

// A page window with `videos` videos whose fetch answers `responses` in
// turn; `cloned` counts the bodies read.
function fakePage(
  videos: number,
  responses: Array<{ url: string; type: string; body: string | string[] }>,
) {
  const events: string[] = [];
  const counts = { cloned: 0, chunks: 0 };
  const scope = {
    fetch: async () => {
      const { url, type, body } = responses.shift()!;
      // Each string is a chunk of the body; `chunks` counts those read.
      const chunks = typeof body === "string" ? [body] : [...body];
      const stream = new ReadableStream<Uint8Array>(
        {
          pull(controller) {
            const chunk = chunks.shift();
            if (chunk === undefined) return controller.close();
            counts.chunks++;
            controller.enqueue(new TextEncoder().encode(chunk));
          },
        },
        { highWaterMark: 0 },
      );
      const response = new Response(stream, {
        headers: { "content-type": type },
      });
      return {
        ok: true,
        url,
        headers: response.headers,
        clone() {
          counts.cloned++;
          return { body: stream };
        },
      } as unknown as Response;
    },
    document: {
      getElementsByTagName: () => ({ length: videos }),
      dispatchEvent(event: Event) {
        assert.equal(event.type, CAPTION_FILE_EVENT);
        events.push(
          JSON.parse((event as CustomEvent<string>).detail).text as string,
        );
        return true;
      },
    },
    CustomEvent,
  } as unknown as CaptionObserverScope;
  installCaptionObserver(scope);
  return { scope, events, counts };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

test("the caption observer skips other responses without reading them", async () => {
  const page = fakePage(1, [
    {
      url: "https://example.com/api/feed",
      type: "application/json",
      body: "{}",
    },
    { url: "https://example.com/", type: "text/html", body: "WEBVTT" },
    { url: "https://example.com/en.vtt", type: "text/plain", body: VTT },
  ]);
  for (let i = 0; i < 3; i++) await page.scope.fetch!("https://example.com/");
  await settle();
  assert.equal(page.counts.cloned, 1);
  assert.deepEqual(page.events, [VTT]);

  // Installed twice (registered, then injected): one wrapper.
  const wrapped = page.scope.fetch;
  installCaptionObserver(page.scope);
  assert.equal(page.scope.fetch, wrapped);
});

test("the caption observer does nothing on a page without a video", async () => {
  const page = fakePage(0, [
    { url: "https://example.com/en.vtt", type: "text/vtt", body: VTT },
  ]);
  await page.scope.fetch!("https://example.com/en.vtt");
  await settle();
  assert.equal(page.counts.cloned, 0);
  assert.deepEqual(page.events, []);
});

test("the caption observer peeks at files of an unnamed type, and skips thumbnail tracks", async () => {
  const binary = "\u0000\u0000\u0000\u0018ftypiso6".padEnd(80, "\u0001");
  const thumbnails = [
    "WEBVTT",
    "",
    "00:00:00.000 --> 00:00:05.000",
    "preview-01.jpg#xywh=0,0,320,180",
    "",
    "00:00:05.000 --> 00:00:10.000",
    "preview-01.jpg#xywh=320,0,320,180",
    "",
  ].join("\n");
  const page = fakePage(1, [
    // Bytes that aren't captions: only the first chunk is read.
    {
      url: "https://cdn.example/seg",
      type: "application/octet-stream",
      body: [binary, "more", "more"],
    },
    {
      url: "https://cdn.example/en.vtt",
      type: "binary/octet-stream",
      body: [VTT.padEnd(70, "\n"), "00:00:03.000 --> 00:00:04.000\nBye.\n"],
    },
    {
      url: "https://cdn.example/preview.vtt",
      type: "application/octet-stream",
      body: thumbnails,
    },
  ]);
  await page.scope.fetch!("https://cdn.example/seg");
  await settle();
  assert.equal(page.counts.chunks, 1);
  await page.scope.fetch!("https://cdn.example/en.vtt");
  await page.scope.fetch!("https://cdn.example/preview.vtt");
  await settle();
  assert.deepEqual(page.events, [
    VTT.padEnd(70, "\n") + "00:00:03.000 --> 00:00:04.000\nBye.\n",
  ]);
  assert.equal(isThumbnailTrack(thumbnails), true);
  assert.equal(isThumbnailTrack(VTT), false);
});
