import type { SetupMessages } from "./en-US";

export const setupDeDE: SetupMessages = {
  title: "OpenBrowserAgent einrichten",
  description: "Fügen Sie einen KI-Anbieter hinzu, um zu chatten.",
  continueSetup: "Einrichtung fortsetzen",
  openedSettings:
    "Die Einrichtung ist in einem anderen Tab geöffnet. Kehren Sie danach hierher zurück.",
  runAgain: "Einrichtung erneut starten",
  progressLabel: "Schritte der Einrichtung",
  progressStep: "Schritt {current} von {total}: {step}",
  steps: {
    language: "Sprache",
    provider: "KI-Anbieter",
    pages: "Auf Webseiten",
    done: "Fertig",
  },
  back: "Zurück",
  next: "Weiter",
  skipStep: "Überspringen",
  languageTitle: "Sprachen wählen",
  languageDescription:
    "Die Sprache der Erweiterung und die Sprache, in die Seiten übersetzt werden. Meist passt beides schon.",
  providerTitle: "KI-Anbieter verbinden",
  providerDescription:
    "Chat und Agent brauchen einen KI-Anbieter. Wählen Sie einen Dienst oder einen beliebigen OpenAI- oder Anthropic-kompatiblen Server mit seiner Base URL.",
  providerPlaceholder: "KI-Anbieter wählen",
  providerReady: "{name} ist bereit. Klicken Sie auf „Weiter“.",
  testConnection: "Verbindung testen",
  testingConnection: "Wird getestet…",
  connectionOk: "Verbunden. {model} hat geantwortet.",
  connectionFailed: "Keine Verbindung zum KI-Anbieter",
  modelFailed: "Verbunden, aber {model} hat nicht geantwortet",
  noModelsListed:
    "Verbunden, aber der KI-Anbieter hat keine Modelle aufgelistet. Geben Sie einen Modellnamen ein.",
  model: "Modell",
  modelName: "Modellname",
  modelNameHint:
    "Wenn der KI-Anbieter seine Modelle nicht auflistet, geben Sie eines mit Namen ein und testen Sie erneut.",
  pagesTitle: "Auf Webseiten",
  pagesDescription:
    "Was OpenBrowserAgent den besuchten Seiten hinzufügt. Sie können es später unter Einstellungen → Auf Webseiten ändern.",
  translateButtonDescription:
    "Eine kleine Schaltfläche am Rand der Seite übersetzt sie oder zeigt das Original.",
  smartBarTitle: "Smart Bar bei markiertem Text",
  smartBarDescription:
    "Schnelle Aktionen neben markiertem Text. Es wird nichts gesendet, bevor Sie eine auswählen.",
  subtitlesDescription:
    "Videos mit Untertiteln zeigen jede Zeile mit der Übersetzung darunter.",
  doneTitle: "Alles bereit",
  doneDescription:
    "Öffnen Sie die Seitenleiste und fragen Sie zur aktuellen Seite. Diese Tastenkombinationen funktionieren auf jeder Seite.",
  noProviderNote:
    "Für den Chat brauchen Sie einen KI-Anbieter. Die Seitenübersetzung mit dem integrierten Übersetzer funktioniert auch ohne.",
  welcomeTitle: "Willkommen bei OpenBrowserAgent",
  openPanelDescription:
    "Heften Sie OpenBrowserAgent im Erweiterungsmenü des Browsers an und klicken Sie auf das Symbol, um die Seitenleiste zu öffnen.",
  openPanel: "Seitenleiste öffnen",
  joinLink:
    "Nutzen Sie OpenBrowserAgent schon auf einem anderen Gerät? Sync-Code einfügen",
  codeTab: "Code einfügen",
  manualTab: "Manuell einrichten",
  code: "Sync-Code",
  codeDescription:
    "Kopieren Sie ihn auf dem anderen Gerät unter Einstellungen → Synchronisierung. Die Sync-Auswahl des Codes ersetzt die dieses Geräts.",
  codeInvalid:
    "Das ist kein gültiger Sync-Code. Kopieren Sie ihn erneut und fügen Sie den ganzen Code ein.",
  connect: "Verbinden und synchronisieren",
  testing: "Verbindung wird hergestellt…",
  pulling: "Wird synchronisiert…",
  failed:
    "Verbindung fehlgeschlagen. Prüfen Sie den Code oder die Serverangaben und versuchen Sie es erneut.",
  connected: "Verbunden. Ihre Einstellungen werden synchronisiert.",
  keysLocked:
    "Ihre API-Schlüssel sind synchronisiert, aber gesperrt. Geben Sie Ihre Sync-Passphrase ein.",
  unlock: "Entsperren",
  skip: "Später",
};
