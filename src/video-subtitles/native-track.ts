import { PRODUCT_NAME } from "../shared/config";
// The lines as the video's own text track, which the browser draws where
// page content can't go: over a video that is itself fullscreen, and in
// picture-in-picture. Shown only there; the layer (overlay.ts) covers the
// rest. Tracks added with addTextTrack can't be removed, so the video keeps
// one, turned off, after translating stops. A line whose words are timed
// shows the words said so far, the cue's text changing as they come.
import type { OverlayContent } from "./overlay";

const own = new WeakSet<TextTrack>();
const tracks = new WeakMap<HTMLVideoElement, TextTrack>();

export function isOwnTrack(track: TextTrack) {
  return own.has(track);
}

export function createNativeTrack(video: HTMLVideoElement) {
  let track = tracks.get(video);
  let cue: VTTCue | undefined;
  let text = "";

  function ensure() {
    if (!track) {
      track = video.addTextTrack("subtitles", PRODUCT_NAME);
      own.add(track);
      tracks.set(video, track);
    }
    return track;
  }

  return {
    show(content: OverlayContent | undefined, until: number) {
      const covered =
        document.fullscreenElement === video ||
        document.pictureInPictureElement === video;
      if (!covered || !content?.original) {
        if (track) track.mode = "disabled";
        return;
      }
      const current = ensure();
      current.mode = "showing";
      // The browser can't keep unsaid words' place: only what is said shows.
      const original =
        content.words && content.said !== undefined
          ? content.words
              .slice(0, content.said)
              .map((word) => word.text)
              .join("")
              .trim()
          : content.original;
      const next = [original, content.translation].filter(Boolean).join("\n");
      const now = video.currentTime;
      const end = Math.max(until, now + 0.5);
      // The cue on screen changes in place as words come, without a new
      // cue each time.
      if (cue && cue.startTime <= now && cue.endTime > now) {
        if (next !== text) cue.text = text = next;
        if (cue.endTime < until) cue.endTime = end;
        return;
      }
      if (cue) current.removeCue(cue);
      text = next;
      cue = new VTTCue(now, end, next);
      current.addCue(cue);
    },
    dispose() {
      if (!track) return;
      if (cue) track.removeCue(cue);
      track.mode = "disabled";
      cue = undefined;
    },
  };
}
