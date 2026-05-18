import type { MutableRefObject } from "react";
import {
  AI_STREAM_REQUEST_TYPE,
  type AiStreamRequest,
} from "../../src/shared/types";

export function closeStreamPort(
  portRef: MutableRefObject<chrome.runtime.Port | undefined>,
  abort: boolean,
) {
  const port = portRef.current;
  portRef.current = undefined;
  if (!port) return;
  try {
    if (abort)
      port.postMessage({
        type: AI_STREAM_REQUEST_TYPE.abort,
      } satisfies AiStreamRequest);
  } catch {
    // Port may already be closed.
  }
  try {
    port.disconnect();
  } catch {
    return;
  }
}
