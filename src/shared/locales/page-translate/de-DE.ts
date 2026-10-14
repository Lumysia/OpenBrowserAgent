import type { PageTranslateLocaleMessages } from "./en-US";

export const pageTranslateDeDE: PageTranslateLocaleMessages = {
  menu: {
    translatePage: "Diese Seite übersetzen",
    showOriginal: "Original anzeigen",
  },
  menuItemLabel: "Diese Seite übersetzen / Original anzeigen",
  settingsTitle: "Seitenübersetzung",
  settingsDescription:
    "Übersetzen Sie ganze Seiten über das Kontextmenü: Wählen Sie „Diese Seite übersetzen“ und zum Zurückkehren „Original anzeigen“.",
  engine: "Übersetzungsdienst",
  engineDescription:
    "Woher die Übersetzungen kommen. Übersetzungen werden auf diesem Gerät gespeichert, sodass bereits übersetzte Seiten sofort wieder erscheinen.",
  engines: {
    model: "KI-Modell",
    browser: "Integrierter Übersetzer (auf dem Gerät)",
    google: "Google Übersetzer (kostenlos)",
    microsoft: "Microsoft Translator (kostenlos)",
  },
  engineDetails: {
    model:
      "Ihr eingerichteter KI-Anbieter übersetzt, mit dem unten gewählten Modell.",
    browser:
      "Der Browser übersetzt auf diesem Gerät; kein Text verlässt es. Jede Sprache wird einmal heruntergeladen.",
    google:
      "Ein inoffizieller kostenloser Dienst, keine API von Google. Er kann jederzeit aufhören zu funktionieren.",
    microsoft:
      "Ein inoffizieller kostenloser Dienst, keine API von Microsoft. Er kann jederzeit aufhören zu funktionieren.",
  },
  cloudNotice: {
    google: "Der Text der Seite wird zum Übersetzen an Google gesendet.",
    microsoft: "Der Text der Seite wird zum Übersetzen an Microsoft gesendet.",
  },
  privacyLink: "Datenschutzerklärung",
  model: "Modell",
  modelDescription: "Das Modell, das Seiten übersetzt.",
  defaultModel: "Im Chat ausgewähltes Modell",
  targetLanguage: "Übersetzen in",
  targetLanguageDescription:
    "Seiten werden in diese Sprache übersetzt. Die Sprache der Erweiterung ändert sich nicht.",
  followInterface: "Sprache der Erweiterung ({language})",
  display: "Anzeige",
  displayDescription:
    "„Original und Übersetzung“ behält jeden Absatz und fügt die Übersetzung darunter ein.",
  displayModes: {
    bilingual: "Original und Übersetzung",
    translation: "Nur Übersetzung",
  },
  cache: "Gespeicherte Übersetzungen",
  cacheDescription:
    "Übersetzungen bleiben 30 Tage auf diesem Gerät, damit übersetzte Seiten sofort wieder erscheinen.",
  clearCache: "Gespeicherte Übersetzungen löschen",
  cacheCleared: "Gespeicherte Übersetzungen gelöscht.",
  errors: {
    unavailable:
      "{engine} ist nicht verfügbar. Prüfen Sie die Seitenübersetzung in den Einstellungen.",
    rateLimited:
      "{engine} begrenzt Anfragen aus diesem Netzwerk. Versuchen Sie es später erneut oder wählen Sie in den Einstellungen einen anderen Dienst.",
    refused:
      "{engine} hat die Übersetzung abgelehnt. Wählen Sie in den Einstellungen einen anderen Dienst.",
    network:
      "{engine} ist nicht erreichbar. Prüfen Sie Ihre Verbindung und versuchen Sie es erneut.",
    failed: "{engine} konnte einige Absätze nicht übersetzen.",
  },
  noModel:
    "Kein KI-Modell eingerichtet. Fügen Sie in den Einstellungen einen Anbieter hinzu.",
  browserUnsupported:
    "Der integrierte Übersetzer kann diese Seite nicht in {language} übersetzen.",
  unavailablePage:
    "Diese Seite kann nicht übersetzt werden: Der Browser lässt Erweiterungen sie nicht ändern.",
};
