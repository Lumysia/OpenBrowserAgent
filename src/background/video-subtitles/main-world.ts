// Runs in the page's own world (scripting.executeScript, world "MAIN") when
// the user starts translating subtitles: passes on the caption files the
// page loads from then on, found by their content. The page can see and
// change this code and fire the event itself, so it only carries data: the
// subtitle script parses and checks what it gets, and nothing here can
// start a translation. Self-contained: it is serialized into the page.
export function observeCaptionFiles(event: string, maxChars: number) {
  const flag = Symbol.for(`oba.captionFiles:${event}`);
  const scope = window as unknown as Record<symbol, boolean>;
  if (scope[flag]) return;
  scope[flag] = true;

  // Media, images, fonts and event streams are never captions.
  const SKIPPED_TYPE =
    /^(video|audio|image|font)\/|octet-stream|mpegurl|dash\+xml|event-stream/i;
  // The start of every format the subtitle script reads (a loose test; it
  // parses properly).
  const looksLikeCaptions = (text: string) => {
    const head = text.slice(0, 2000).replace(/^\uFEFF?\s*/, "");
    return (
      /^WEBVTT/.test(head) ||
      /^\d+\s*\r?\n\s*\d+:\d+:\d+[,.]\d+\s+-->/.test(head) ||
      (head[0] === "<" && /<(\w+:)?tt[\s>]/.test(head)) ||
      (head[0] === "{" && /"tStartMs"\s*:/.test(head))
    );
  };
  const report = (url: string, text: string) => {
    if (text.length > maxChars || !looksLikeCaptions(text)) return;
    document.dispatchEvent(
      new CustomEvent(event, { detail: JSON.stringify({ url, text }) }),
    );
  };
  const skipped = (type: string | null, length: string | null) =>
    (!!type && SKIPPED_TYPE.test(type)) || Number(length) > maxChars;
  // Reads at most maxChars (plus one chunk) of a copy of the body, so a long
  // or never-ending response (event streams, downloads without a length) is
  // not buffered whole.
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

  const originalFetch = window.fetch;
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
          skipped(headers.get("content-type"), headers.get("content-length"))
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
    window.fetch = observedFetch as typeof fetch;
  } catch {
    // A page that locked fetch: only XHR is observed.
  }

  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (
    this: XMLHttpRequest,
    ...args: Parameters<XMLHttpRequest["send"]>
  ) {
    this.addEventListener("load", () => {
      try {
        if (
          this.status < 200 ||
          this.status >= 300 ||
          skipped(
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
