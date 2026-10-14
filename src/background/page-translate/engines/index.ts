import {
  PAGE_TRANSLATE_ENGINE,
  type PageTranslateSettings,
} from "../../../shared/page-translate/settings";
import { PAGE_TRANSLATE_ERROR } from "../../../shared/page-translate/protocol";
import { resolveModel } from "../../model-resolver";
import { browserEngine } from "./browser";
import { googleEngine } from "./google";
import { microsoftEngine } from "./microsoft";
import { modelEngine } from "./model";
import { EngineError, type TranslationEngine } from "./types";

export { EngineError, type TranslationEngine } from "./types";

export async function resolveEngine(
  settings: PageTranslateSettings,
): Promise<TranslationEngine> {
  switch (settings.engine) {
    case PAGE_TRANSLATE_ENGINE.browser:
      return browserEngine();
    case PAGE_TRANSLATE_ENGINE.google:
      return googleEngine();
    case PAGE_TRANSLATE_ENGINE.microsoft:
      return microsoftEngine();
    default: {
      const model = await resolveModel(settings.modelId).catch(() => {
        throw new EngineError(PAGE_TRANSLATE_ERROR.unavailable, "No model");
      });
      return modelEngine(model);
    }
  }
}
