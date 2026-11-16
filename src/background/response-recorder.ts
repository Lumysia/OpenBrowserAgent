// What the responses to one model request did, for SDKs that take a fetch
// function (Pi's OpenAI and Anthropic adapters): the HTTP status, and
// whether the connection dropped while a successful response was streaming.
export function responseRecorder(
  base: typeof fetch = (...args) => fetch(...args),
) {
  let status: number | undefined;
  let droppedMidStream = false;
  const recording: typeof fetch = async (input, init) => {
    const response = await base(input, init);
    status = response.status;
    if (!response.ok || !response.body) return response;
    const signal =
      init?.signal ?? (input instanceof Request ? input.signal : undefined);
    return withBodyFailure(response, (error) => {
      // Fetch rejects a body read with a TypeError when the network fails;
      // a read the request's own signal aborted is a cancellation.
      if (error instanceof TypeError && !signal?.aborted)
        droppedMidStream = true;
    });
  };
  return {
    fetch: recording,
    status: () => status,
    droppedMidStream: () => droppedMidStream,
  };
}

// The same response, reporting a failed read of its body before the reader
// sees it.
function withBodyFailure(
  response: Response,
  onFailure: (error: unknown) => void,
) {
  const reader = response.body!.getReader();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) controller.close();
        else controller.enqueue(value);
      } catch (error) {
        onFailure(error);
        controller.error(error);
      }
    },
    cancel: (reason) => reader.cancel(reason),
  });
  const watched = new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
  Object.defineProperty(watched, "url", { value: response.url });
  return watched;
}
