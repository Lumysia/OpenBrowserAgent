// Runs in the page's own world: passes the caption files the page loads to
// the subtitle script. Registered before the page's scripts on every page
// while subtitles are always on (so a player's first caption file is seen),
// else injected when the user starts them. The page can see and change
// this code and fire the event itself, so it only carries data: the
// subtitle script parses and checks what it gets, and nothing here can
// start a translation.
//
// It is kept cheap for pages that never show captions: nothing is looked
// at while the page has no video, and a response is read only when its
// headers or URL name it a caption file (see caption-filter.ts), and then
// at most CAPTION_RESPONSE_MAX_CHARS of it.
import {
  isCaptionCandidate,
  looksLikeCaptions,
} from "../shared/video-subtitles/caption-filter";
import {
  CAPTION_FILE_EVENT,
  CAPTION_RESPONSE_MAX_CHARS,
} from "../shared/video-subtitles/protocol";

const INSTALLED = Symbol.for("oba.captionObserver");

// What it uses of the page's window (a fake one in tests).
export type CaptionObserverScope = {
  fetch?: typeof fetch;
  XMLHttpRequest?: typeof XMLHttpRequest;
  document: Pick<Document, "dispatchEvent" | "getElementsByTagName">;
  CustomEvent: typeof CustomEvent;
};

export function installCaptionObserver(
  scope: CaptionObserverScope,
  maxChars = CAPTION_RESPONSE_MAX_CHARS,
) {
  const flags = scope as unknown as Record<symbol, boolean>;
  if (flags[INSTALLED]) return;
  flags[INSTALLED] = true;

  const { document } = scope;
  const videos = document.getElementsByTagName("video");
  const candidate = (url: string, type: string | null, length: string | null) =>
    videos.length > 0 && isCaptionCandidate({ url, type, length }, maxChars);

  const report = (url: string, text: string) => {
    if (text.length > maxChars || !looksLikeCaptions(text)) return;
    document.dispatchEvent(
      new scope.CustomEvent(CAPTION_FILE_EVENT, {
        detail: JSON.stringify({ url, text }),
      }),
    );
  };

  // Reads at most maxChars (plus one chunk) of a copy of the body, so a long
  // or never-ending response is not buffered whole.
  const readHead = async (body: ReadableStream<Uint8Array>) => {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    try {
      while (text.length <= maxChars) {
        const { done, value } = await reader.read();
        if (done) return text + decoder.decode();
        text += decoder.decode(value, { stream: true });
      }
      return undefined;
    } finally {
      reader.cancel().catch(() => undefined);
    }
  };

  const originalFetch = scope.fetch;
  if (originalFetch) {
    const observedFetch = function (
      this: unknown,
      ...args: Parameters<typeof fetch>
    ) {
      const response = originalFetch.apply(this, args);
      response
        .then((value) => {
          const { headers } = value;
          if (
            !value.ok ||
            !candidate(
              value.url,
              headers.get("content-type"),
              headers.get("content-length"),
            )
          )
            return;
          const body = value.clone().body;
          if (!body) return;
          return readHead(body).then(
            (text) => text !== undefined && report(value.url, text),
          );
        })
        .catch(() => undefined);
      return response;
    };
    try {
      scope.fetch = observedFetch as typeof fetch;
    } catch {
      // A page that locked fetch: only XHR is observed.
    }
  }

  const prototype = scope.XMLHttpRequest?.prototype;
  if (!prototype) return;
  const originalSend = prototype.send;
  prototype.send = function (
    this: XMLHttpRequest,
    ...args: Parameters<XMLHttpRequest["send"]>
  ) {
    this.addEventListener("load", () => {
      try {
        if (
          this.status < 200 ||
          this.status >= 300 ||
          !candidate(
            this.responseURL,
            this.getResponseHeader("content-type"),
            this.getResponseHeader("content-length"),
          )
        )
          return;
        const type = this.responseType;
        if (type === "" || type === "text")
          report(this.responseURL, this.responseText);
        else if (
          type === "json" &&
          Array.isArray((this.response as { events?: unknown } | null)?.events)
        )
          report(this.responseURL, JSON.stringify(this.response));
      } catch {
        // A response the page made unreadable.
      }
    });
    return originalSend.apply(this, args);
  };
}
