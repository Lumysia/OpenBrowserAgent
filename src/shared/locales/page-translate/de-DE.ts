import type { PageTranslateLocaleMessages } from "./en-US";

export const pageTranslateDeDE: PageTranslateLocaleMessages = {
  menu: {
    translatePage: "Diese Seite übersetzen",
    showOriginal: "Original anzeigen",
  },
  menuItemLabel: "Diese Seite übersetzen / Original anzeigen",
  settingsTitle: "Seitenübersetzung",
  settingsDescription:
    "Wählen Sie im Kontextmenü „Diese Seite übersetzen“, um eine Seite zu übersetzen, und „Original anzeigen“, um zum Original zurückzukehren.",
  engine: "Übersetzungsdienst",
  engineDescription: "Wählen Sie, womit Seiten übersetzt werden.",
  engines: {
    model: "KI-Modell",
    browser: "Integrierter Übersetzer (auf dem Gerät)",
    google: "Google Übersetzer (kostenlos)",
    microsoft: "Microsoft Translator (kostenlos)",
  },
  engineDetails: {
    model:
      "Ihr KI-Anbieter übersetzt die Seiten mit dem unten gewählten Modell.",
    browser:
      "Der Browser übersetzt auf diesem Gerät; kein Text verlässt es. Jede Sprache wird einmal heruntergeladen.",
    google:
      "Ein inoffizieller kostenloser Dienst, keine API von Google. Er kann jederzeit aufhören zu funktionieren.",
    microsoft:
      "Ein inoffizieller kostenloser Dienst, keine API von Microsoft. Er kann jederzeit aufhören zu funktionieren.",
  },
  cloudNotice: {
    google:
      "Der Text der Seite wird zum Übersetzen an Google gesendet. Wenn Google auf einer Seite ausfällt, übersetzt Microsoft den Rest der Seite.",
    microsoft:
      "Der Text der Seite wird zum Übersetzen an Microsoft gesendet. Wenn Microsoft auf einer Seite ausfällt, übersetzt Google den Rest der Seite.",
  },
  freeServices: {
    google: "Google",
    microsoft: "Microsoft",
  },
  privacyLink: "Datenschutzerklärung",
  model: "Modell",
  modelDescription: "Das Modell, das Seiten übersetzt.",
  defaultModel: "Gleiches Modell wie im Chat",
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
  clearCacheFailed: "Gespeicherte Übersetzungen konnten nicht gelöscht werden",
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
    allFailed:
      "Weder {engine} noch {fallback} konnte übersetzen. Versuchen Sie es später erneut oder wählen Sie in den Einstellungen einen anderen Dienst.",
  },
  switched: {
    rateLimited:
      "{engine} begrenzt die Anfragen; diese Seite wird jetzt mit {fallback} übersetzt.",
    failed:
      "{engine} funktioniert gerade nicht; diese Seite wird jetzt mit {fallback} übersetzt.",
  },
  browserUnsupported:
    "Der integrierte Übersetzer kann diese Seite nicht in {language} übersetzen.",
  unavailablePage:
    "Diese Seite kann nicht übersetzt werden: Der Browser lässt Erweiterungen sie nicht ändern.",
};
