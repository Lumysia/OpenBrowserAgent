import { Languages } from "lucide-react";
import { resolveLanguage, UI_LANGUAGES } from "../../src/shared/ui-languages";
import { storage } from "../../src/shared/storage";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingsSection,
} from "../../src/ui/components";
import { useMessages } from "../../src/ui/messages";
import { useStoredState } from "../../src/ui/useStoredState";

// The extension's own language (its menus and settings, not the answers).
export function UiLanguageSection() {
  const t = useMessages();
  const [language, setLanguage] = useStoredState(storage.language);
  return (
    <SettingsSection
      icon={<Languages />}
      title={t.common.language}
      description={t.options.languageDescription}
    >
      <Select value={resolveLanguage(language)} onValueChange={setLanguage}>
        <SelectTrigger aria-label={t.common.language}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {UI_LANGUAGES.map(({ code: id, label }) => (
            <SelectItem key={id} value={id}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SettingsSection>
  );
}
