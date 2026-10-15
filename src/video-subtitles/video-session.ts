// One video's translated subtitles. Its lines come from the best source
// there is, and a better one replaces it when it turns up:
// 1. the video's own text tracks;
// 2. a caption file the page loaded (see caption-files.ts);
// 3. the captions the player draws as page text, line by line as they show
//    (see dom-captions.ts).
// With the whole track known, lines are translated a little ahead of the
// playhead (schedule.ts); page text is translated as each line settles.
import type { Cue } from "../shared/video-subtitles/cues";
import { linesInWindow, lineAt } from "../shared/video-subtitles/schedule";
import {
  segmentCues,
  type SubtitleLine,
} from "../shared/video-subtitles/segment";
import { createNativeTrack } from "./native-track";
import { createOverlay, type OverlayContent } from "./overlay";
import { watchCaptionFiles, type CaptionFile } from "./sources/caption-files";
import { watchDomCaptions } from "./sources/dom-captions";
import { createTextTrackSource } from "./sources/text-track";
import type { VideoSubtitlesNotes } from "../shared/video-subtitles/protocol";
import { showToast } from "../page-translate/toast";
import type { SubtitleTranslator, WantedLine } from "./translator";

// Lines said before a line, given to the AI model as context.
const CONTEXT_LINES = 2;
// The window of lines to translate moves when the playhead has.
const RESCHEDULE_SECONDS = 5;
// A caption file whose first line starts this long after the video ends
// belongs to another video.
const DURATION_SLACK_SECONDS = 5;
// How long a line from the page's own captions stays in the video's text
// track (it is replaced as soon as the next one shows).
const LIVE_LINE_SECONDS = 4;
// Playing this long without any subtitles found brings up a note, for
// subtitles the user started.
const NO_CAPTIONS_MS = 8_000;

export type VideoSession = ReturnType<typeof startVideoSession>;

export function startVideoSession(
  video: HTMLVideoElement,
  translator: SubtitleTranslator,
  // The notes to show; none for subtitles that started by themselves.
  notes: VideoSubtitlesNotes | undefined,
) {
  const owner = {};
  const overlay = createOverlay(video);
  const native = createNativeTrack(video);
  let file: CaptionFile | undefined;
  // When the video last loaded a new source: files from before belong to
  // the previous one.
  let loadedAt = -Infinity;
  let cueSource: Cue[] | undefined;
  let lines: SubtitleLine[] = [];
  let scheduledAt: number | undefined;
  let liveText = "";
  const liveLines: string[] = [];
  let frame: number | undefined;

  const track = createTextTrackSource(video, () => refreshLines());
  const dom = watchDomCaptions(video, {
    onText(text) {
      liveText = text;
      update();
    },
    onLine(text) {
      liveLines.push(text);
      if (liveLines.length > CONTEXT_LINES + 1) liveLines.shift();
      if (!cueSource)
        translator.want(owner, [
          { text, before: liveLines.slice(0, -1).join(" ") || undefined },
        ]);
    },
  });
  const stopFiles = watchCaptionFiles((next) => {
    if (next.at < loadedAt || !fits(next.cues)) return;
    file = next;
    refreshLines();
  });

  function fits(cues: Cue[]) {
    const duration = video.duration;
    return (
      !Number.isFinite(duration) ||
      !cues.length ||
      cues[0]!.start <= duration + DURATION_SLACK_SECONDS
    );
  }

  // The best source's lines, again when a source changes.
  function refreshLines() {
    const next = track.available ? track.cues : file?.cues;
    if (next === cueSource) return;
    cueSource = next;
    lines = next ? segmentCues(next) : [];
    scheduledAt = undefined;
    update();
  }

  // A source with lines: until then the video costs nothing per frame.
  function hasLines() {
    return !!cueSource || dom.found || !!liveText;
  }

  function schedule(time: number) {
    if (
      scheduledAt !== undefined &&
      Math.abs(time - scheduledAt) < RESCHEDULE_SECONDS
    )
      return;
    scheduledAt = time;
    const indexes = new Map(lines.map((line, index) => [line, index]));
    const wanted: WantedLine[] = linesInWindow(lines, time).map((line) => {
      const index = indexes.get(line)!;
      const before = lines
        .slice(Math.max(0, index - CONTEXT_LINES), index)
        .map((previous) => previous.text)
        .join(" ");
      return { text: line.text, ...(before && { before }) };
    });
    translator.want(owner, wanted);
  }

  function contentFor(text: string): OverlayContent {
    const { translation, partial, pending } = translator.lookup(text);
    return {
      original: text,
      translation: translation ?? partial,
      pending: !translation && pending,
    };
  }

  function render() {
    const time = video.currentTime;
    let content: OverlayContent | undefined;
    let until = time + LIVE_LINE_SECONDS;
    if (cueSource) {
      const line = lineAt(lines, time);
      if (line) {
        content = contentFor(line.text);
        until = line.end;
      }
    } else if (liveText) content = contentFor(liveText);
    overlay.show(content, translator.language);
    native.show(content, until);
  }

  function update() {
    if (cueSource) schedule(video.currentTime);
    render();
    if (!video.paused) play();
  }

  // Each frame while playing with lines, so they change on time.
  function loop() {
    frame = undefined;
    update();
  }
  function play() {
    if (frame === undefined && hasLines()) frame = requestAnimationFrame(loop);
  }
  const seeked = () => {
    scheduledAt = undefined;
    update();
  };
  const reloaded = () => {
    loadedAt = performance.now();
    file = undefined;
    liveLines.length = 0;
    refreshLines();
  };
  const events: Array<[EventTarget, string, () => void]> = [
    [video, "play", play],
    [video, "seeked", seeked],
    [video, "seeking", seeked],
    [video, "pause", update],
    [video, "emptied", reloaded],
    [document, "fullscreenchange", update],
    [video, "enterpictureinpicture", update],
    [video, "leavepictureinpicture", update],
  ];
  for (const [target, type, listener] of events)
    target.addEventListener(type, listener, { passive: true, capture: true });
  refreshLines();
  const noteTimer = window.setTimeout(() => {
    if (cueSource || !notes) return;
    showToast(
      dom.found || liveText ? notes.liveOnly : notes.noCaptions,
      notes.theme,
    );
  }, NO_CAPTIONS_MS);

  return {
    video,
    // A translation arrived: the line on screen may be it.
    refresh: render,
    stop() {
      for (const [target, type, listener] of events)
        target.removeEventListener(type, listener, { capture: true });
      if (frame !== undefined) cancelAnimationFrame(frame);
      clearTimeout(noteTimer);
      stopFiles();
      track.dispose();
      dom.dispose();
      native.dispose();
      overlay.dispose();
      translator.forget(owner);
    },
  };
}
