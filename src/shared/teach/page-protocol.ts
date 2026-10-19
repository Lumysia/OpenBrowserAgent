// Between the background and the recorder in the recording page
// (PAGE_SCRIPT.teachRecorder). Dependency-free: the page script imports it.
import type { PageToastTheme } from "../page-toast";

// The recorder leaves its start function under this global of the
// extension's isolated world; the background calls it after injecting.
export const TEACH_RECORDER_GLOBAL = "__obaTeachRecorder";

export type TeachPageConfig = {
  theme: PageToastTheme;
  // The pill's words, in the user's UI language.
  messages: { recording: string; stop: string; stopHint: string };
};
