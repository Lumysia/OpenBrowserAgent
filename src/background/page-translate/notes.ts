import { getMessages } from "../../shared/i18n";
import { getPageTranslateMessages } from "../../shared/page-translate/messages";
import {
  PAGE_TRANSLATE_ERROR,
  type PageTranslateEvent,
} from "../../shared/page-translate/protocol";
import type { PageTranslateEngine } from "../../shared/page-translate/settings";
import type { PageToastTheme } from "../../shared/page-toast";
import { formatMessage } from "../../shared/text";
import { UserError, userErrorText } from "../../shared/user-errors";
import { errorWithDetail } from "../../ui/error-text";
import { EngineError } from "./engines/types";

// The notes a page session shows: why translating failed, and which engine
// took over.

export function errorEvent(
  error: unknown,
  batch: number | undefined,
  context: {
    language: string;
    theme: PageToastTheme;
    // The engine in use when it failed.
    kind: PageTranslateEngine;
    // The engine chosen in the settings.
    selected: PageTranslateEngine;
  },
): PageTranslateEvent {
  const kind =
    error instanceof EngineError
      ? error.kind
      : error instanceof UserError
        ? PAGE_TRANSLATE_ERROR.unavailable
        : PAGE_TRANSLATE_ERROR.failed;
  const messages = getPageTranslateMessages(context.language);
  const t = getMessages(context.language);
  let message = messages.errors[kind].replaceAll(
    "{engine}",
    messages.engines[context.kind],
  );
  if (error instanceof UserError) message = userErrorText(error, t);
  // An error from elsewhere (the provider, the browser) adds its own text.
  else if (!(error instanceof EngineError))
    message = errorWithDetail(message, error, t);
  else if (kind === PAGE_TRANSLATE_ERROR.allFailed)
    message = engineMessage(
      messages.errors.allFailed,
      context.language,
      context.selected,
      context.kind,
    );
  return { type: "error", batch, kind, message, theme: context.theme };
}

export function switchMessage(
  language: string,
  from: PageTranslateEngine,
  to: PageTranslateEngine,
  error: EngineError,
) {
  const { switched } = getPageTranslateMessages(language);
  return engineMessage(
    error.kind === PAGE_TRANSLATE_ERROR.rateLimited
      ? switched.rateLimited
      : error.kind === PAGE_TRANSLATE_ERROR.unavailable
        ? switched.unavailable
        : switched.failed,
    language,
    from,
    to,
  );
}

// {engine}: the engine that failed first; {fallback}: the one after it.
function engineMessage(
  template: string,
  language: string,
  engine: PageTranslateEngine,
  fallback: PageTranslateEngine,
) {
  const { engineNames } = getPageTranslateMessages(language);
  return formatMessage(template, {
    engine: engineNames[engine],
    fallback: engineNames[fallback],
  });
}
