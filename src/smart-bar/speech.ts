// Reads text aloud with the browser's own voices (Web Speech API): no
// permission, no network request from the extension. The page shares this
// frame's speech queue, so it can tell that something is spoken, or stop it,
// but it can't read the text.

// Some voices (Chrome's network voices) stop after about 15 seconds of one
// utterance, so long text is queued in sentence-sized pieces.
const CHUNK_CHARS = 200;

let current: { stop: () => void } | undefined;

// Starts reading `text`, replacing anything this frame reads. `onEnd` runs
// once when it finishes, fails or is stopped. Returns the stop function.
export function speak(
  text: string,
  lang: string | undefined,
  onEnd: () => void,
) {
  const synthesis = globalThis.speechSynthesis;
  current?.stop();
  if (!synthesis || !text.trim()) {
    onEnd();
    return () => undefined;
  }
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    if (current === handle) current = undefined;
    onEnd();
  };
  const handle = {
    stop: () => {
      if (done) return;
      finish();
      synthesis.cancel();
    },
  };
  current = handle;
  // Starts now, not after what the page queued.
  synthesis.cancel();
  const pieces = speechChunks(text);
  pieces.forEach((piece, index) => {
    const utterance = new SpeechSynthesisUtterance(piece);
    if (lang) utterance.lang = lang;
    utterance.addEventListener("error", finish);
    if (index === pieces.length - 1) utterance.addEventListener("end", finish);
    synthesis.speak(utterance);
  });
  return handle.stop;
}

export function speechChunks(text: string, size = CHUNK_CHARS) {
  const sentences = text
    .split(/(?<=[.!?;。！？；\n])\s*/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let chunk = "";
  for (const sentence of sentences) {
    for (let start = 0; start < sentence.length; start += size) {
      const part = sentence.slice(start, start + size);
      if (chunk && chunk.length + part.length + 1 > size) {
        chunks.push(chunk);
        chunk = "";
      }
      chunk = chunk ? `${chunk} ${part}` : part;
    }
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}
