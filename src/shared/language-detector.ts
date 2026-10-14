// The browser's on-device language detector (Chrome 138+), for text whose
// script doesn't tell its language. Used only when its model is already
// there: reading aloud never starts a download. Dependency-free: the page
// scripts import this module.
import type { DetectLanguage, LanguageDetection } from "./speech-language";

type LanguageDetectorInstance = {
  detect(text: string): Promise<LanguageDetection[]>;
};

export type LanguageDetectorApi = {
  availability(): Promise<string>;
  create(): Promise<LanguageDetectorInstance>;
};

// `api` defaults to the global LanguageDetector. The detector is created
// once; while it is unavailable, every call checks again.
export function languageDetect(
  api: () => LanguageDetectorApi | undefined = () =>
    (globalThis as { LanguageDetector?: LanguageDetectorApi }).LanguageDetector,
): DetectLanguage {
  let detector: Promise<LanguageDetectorInstance | undefined> | undefined;
  return async (text) => {
    detector ??= createDetector(api());
    const instance = await detector;
    if (!instance) detector = undefined;
    return instance?.detect(text);
  };
}

async function createDetector(api: LanguageDetectorApi | undefined) {
  try {
    if (!api || (await api.availability()) !== "available") return undefined;
    return await api.create();
  } catch {
    return undefined;
  }
}
