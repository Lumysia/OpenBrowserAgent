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
import { isCaptionCandidate } from "../src/shared/video-subtitles/caption-filter";
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
    VIDEO_SUBTITLE_SCRIPTS.map(({ file, allFrames, runAt, world }) => ({
      file,
      allFrames,
      runAt,
      world,
    })),
    [
      {
        file: PAGE_SCRIPT.videoSubtitles,
        allFrames: true,
        runAt: "document_start",
        world: undefined,
      },
      {
        file: PAGE_SCRIPT.captionObserver,
        allFrames: true,
        runAt: "document_start",
        world: "MAIN",
      },
    ],
  );
});

test("only responses named caption files by their type or URL are read", () => {
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
    assert.equal(isCaptionCandidate(yes, max), true, yes.url);
  for (const no of [
    head("https://example.com/api/feed", "application/json"),
    head("https://example.com/page", "text/html"),
    head("https://example.com/subscriptions", "application/json"),
    head("https://example.com/captions/clip.mp4", "video/mp4"),
    head("https://example.com/captions.vtt", "text/vtt", 5_000),
  ])
    assert.equal(isCaptionCandidate(no, max), false, no.url);
});

const VTT = "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello.\n";

// A page window with `videos` videos whose fetch answers `responses` in
// turn; `cloned` counts the bodies read.
function fakePage(
  videos: number,
  responses: Array<{ url: string; type: string; body: string }>,
) {
  const events: string[] = [];
  const counts = { cloned: 0 };
  const scope = {
    fetch: async () => {
      const { url, type, body } = responses.shift()!;
      const response = new Response(body, {
        headers: { "content-type": type },
      });
      return {
        ok: true,
        url,
        headers: response.headers,
        clone() {
          counts.cloned++;
          return response.clone();
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
