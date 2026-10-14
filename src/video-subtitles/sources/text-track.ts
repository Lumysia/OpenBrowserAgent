// Subtitles the video carries itself (`<track>`, or tracks a player adds
// with addTextTrack): the browser holds their cues. The chosen track is set
// to "hidden", so its cues still load and the browser draws nothing; the
// track's own mode comes back when translating stops. Players that stream
// captions (HLS, DASH) add cues while the video plays.
import { plainCueText, type Cue } from "../../shared/video-subtitles/cues";
import { isOwnTrack } from "../native-track";

const SUBTITLE_KINDS = new Set(["subtitles", "captions", ""]);
// How often cues added ahead of the playhead are looked for.
const POLL_MS = 2_000;

export type TextTrackSource = ReturnType<typeof createTextTrackSource>;

export function createTextTrackSource(
  video: HTMLVideoElement,
  onChange: () => void,
) {
  let track: TextTrack | undefined;
  let mode: TextTrackMode | undefined;
  let cues: Cue[] = [];
  let count = -1;
  let first: VTTCue | TextTrackCue | undefined;
  // Changes are reported from when the source is set up.
  let ready = false;

  const tracks = () =>
    [...video.textTracks].filter(
      (item) => SUBTITLE_KINDS.has(item.kind) && !isOwnTrack(item),
    );

  // The track the viewer turned on, else the default one, else the first.
  function choose() {
    const list = tracks();
    const elements = [...video.querySelectorAll("track")];
    return (
      list.find((item) => item.mode === "showing") ??
      list.find((item) =>
        elements.some((element) => element.default && element.track === item),
      ) ??
      list[0]
    );
  }

  function select(next: TextTrack | undefined) {
    if (next === track) return;
    release();
    track = next;
    if (!track) return;
    mode = track.mode;
    track.mode = "hidden";
    track.addEventListener("cuechange", read);
    read();
  }

  function release() {
    if (!track) return;
    track.removeEventListener("cuechange", read);
    if (mode && track.mode === "hidden") track.mode = mode;
    track = undefined;
    cues = [];
    count = -1;
    first = undefined;
  }

  function read() {
    const list = track?.cues;
    if (!list) return;
    // Unchanged: no cue added or replaced at the start.
    if (list.length === count && list[0] === first) return;
    count = list.length;
    first = list[0];
    const next: Cue[] = [];
    for (const cue of list) {
      const text = plainCueText((cue as VTTCue).text ?? "");
      if (text && cue.endTime > cue.startTime)
        next.push({ start: cue.startTime, end: cue.endTime, text });
    }
    cues = next.sort((a, b) => a.start - b.start);
    if (ready) onChange();
  }

  // The viewer picked another track in the player's own menu.
  const changed = () => {
    const showing = tracks().find(
      (item) => item !== track && item.mode === "showing",
    );
    if (showing) select(showing);
    else if (!track) select(choose());
  };
  video.textTracks.addEventListener("addtrack", changed);
  video.textTracks.addEventListener("change", changed);
  const timer = window.setInterval(read, POLL_MS);
  select(choose());
  ready = true;

  return {
    get cues() {
      return cues;
    },
    // A track with cues to translate.
    get available() {
      return cues.length > 0;
    },
    dispose() {
      clearInterval(timer);
      video.textTracks.removeEventListener("addtrack", changed);
      video.textTracks.removeEventListener("change", changed);
      release();
    },
  };
}
