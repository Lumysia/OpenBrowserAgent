import { PRODUCT_NAME } from "../shared/config";
// The lines as the video's own text track, which the browser draws where
// page content can't go: over a video that is itself fullscreen, and in
// picture-in-picture. Shown only there; the layer (overlay.ts) covers the
// rest. Tracks added with addTextTrack can't be removed, so the video keeps
// one, turned off, after translating stops.
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
      const next = [content.original, content.translation]
        .filter(Boolean)
        .join("\n");
      const now = video.currentTime;
      if (cue && next === text && cue.endTime >= until) return;
      if (cue) current.removeCue(cue);
      text = next;
      cue = new VTTCue(now, Math.max(until, now + 0.5), next);
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
