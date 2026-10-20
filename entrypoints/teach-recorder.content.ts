import { defineContentScript } from "wxt/utils/define-content-script";
import {
  TEACH_MESSAGE,
  TEACH_PAGE_MESSAGE,
} from "../src/shared/teach/messages";
import {
  TEACH_RECORDER_GLOBAL,
  type TeachPageConfig,
} from "../src/shared/teach/page-protocol";
import { startCapture, type Capture } from "../src/teach-recorder/capture";
import { showRecordingPill } from "../src/teach-recorder/pill";
import { watchUnseen } from "../src/teach-recorder/unseen";

// Teach mode's recorder (see src/teach-recorder): the background injects it
// into the top frame of a tab it records, again after each navigation, and
// starts it through the global. Never in the manifest.
type Recorder = { capture: Capture; end: () => void };

type Globals = typeof globalThis & {
  [TEACH_RECORDER_GLOBAL]?: (config: TeachPageConfig) => boolean;
  __obaTeachRecorderActive?: Recorder;
};

export default defineContentScript({
  registration: "runtime",
  // Tells the page nothing about the extension.
  noScriptStartedPostMessage: true,
  main() {
    const globals = globalThis as Globals;
    globals[TEACH_RECORDER_GLOBAL] = (config) => {
      if (globals.__obaTeachRecorderActive) return true;
      const send = (message: unknown) =>
        chrome.runtime.sendMessage(message).catch(() => undefined);
      const capture = startCapture(
        (event) => send({ type: TEACH_MESSAGE.event, event }),
        config,
      );
      const stopUnseen = watchUnseen((kind) =>
        send({ type: TEACH_MESSAGE.unrecorded, kind }),
      );
      const removePill = showRecordingPill(config, () =>
        send({ type: TEACH_MESSAGE.pageStop }),
      );
      const end = () => {
        capture.stop();
        stopUnseen();
        removePill();
      };
      globals.__obaTeachRecorderActive = { capture, end };
      const onMessage = (
        message: { type?: string; stepId?: string; url?: string } | undefined,
        _sender: unknown,
        sendResponse: (value: unknown) => void,
      ) => {
        if (message?.type === TEACH_PAGE_MESSAGE.example) {
          sendResponse(capture.exampleOf(String(message.stepId)));
          return;
        }
        if (message?.type === TEACH_PAGE_MESSAGE.redact) {
          sendResponse(capture.redact(String(message.url || "")));
          return;
        }
        if (message?.type !== TEACH_PAGE_MESSAGE.end) return;
        end();
        chrome.runtime.onMessage.removeListener(onMessage);
        delete globals.__obaTeachRecorderActive;
        sendResponse(true);
      };
      chrome.runtime.onMessage.addListener(onMessage);
      return true;
    };
  },
});
