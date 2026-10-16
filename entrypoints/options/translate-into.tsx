import { Languages } from "lucide-react";
import { SettingsSection } from "../../src/ui/components";
import { useMessages } from "../../src/ui/messages";
import { TranslateIntoSelect } from "../../src/ui/translate-into-select";

// The language pages are translated into (page translation's target).
export function TranslateIntoSection() {
  const p = useMessages().pageTranslate;
  return (
    <SettingsSection
      icon={<Languages />}
      title={p.targetLanguage}
      description={p.targetLanguageDescription}
    >
      <TranslateIntoSelect />
    </SettingsSection>
  );
}
