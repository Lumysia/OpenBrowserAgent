import { enUS, type LocaleMessages } from "./en-US";

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

function mergeMessages(
  base: LocaleMessages,
  override: DeepPartial<LocaleMessages>,
): LocaleMessages {
  const next: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const baseValue = (base as Record<string, unknown>)[key];
    next[key] =
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      baseValue &&
      typeof baseValue === "object"
        ? mergeMessages(
            baseValue as LocaleMessages,
            value as DeepPartial<LocaleMessages>,
          )
        : value;
  }
  return next as LocaleMessages;
}

export function createLocale(
  messages: DeepPartial<LocaleMessages>,
): LocaleMessages {
  return mergeMessages(enUS, messages);
}
