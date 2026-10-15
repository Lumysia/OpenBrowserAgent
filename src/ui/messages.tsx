import { createContext, useContext, useMemo, type ReactNode } from "react";
import { getMessages, type Messages } from "../shared/i18n";

type UiLanguage = { language: string | undefined; t: Messages };

const UiLanguageContext = createContext<UiLanguage | null>(null);

// The stored UI language, read once at the root of a page (options, side
// panel) and handed down, instead of each component watching storage.
export function MessagesProvider({
  language,
  children,
}: {
  language: string | undefined;
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({ language, t: getMessages(language) }),
    [language],
  );
  return (
    <UiLanguageContext.Provider value={value}>
      {children}
    </UiLanguageContext.Provider>
  );
}

function useUiLanguageContext() {
  const value = useContext(UiLanguageContext);
  if (!value) throw new Error("MessagesProvider is missing");
  return value;
}

export function useMessages() {
  return useUiLanguageContext().t;
}

export function useUiLanguage() {
  return useUiLanguageContext().language;
}
