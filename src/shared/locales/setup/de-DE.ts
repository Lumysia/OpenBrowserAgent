import { plural } from "../../plural";
import type { SetupMessages } from "./en-US";

export const setupDeDE: SetupMessages = {
  continueSetup: "Einrichtung fortsetzen",
  runAgain: "Einrichtung erneut starten",
  progressLabel: "Schritte der Einrichtung",
  progressStep: "Schritt {current} von {total}: {step}",
  steps: {
    language: "Sprache",
    path: "Neu oder bestehend",
    provider: "KI-Anbieter",
    pages: "Auf Webseiten",
    sync: "Synchronisierung",
    passphrase: "Sync-Passphrase",
    download: "Download",
    done: "Fertig",
  },
  back: "Zurück",
  next: "Weiter",
  skipStep: "Überspringen",
  languageTitle: "Sprachen wählen",
  languageDescription:
    "Die Sprache der Erweiterung und die Sprache, in die Seiten übersetzt werden. Meist passt beides schon.",
  pathTitle: "Haben Sie OpenBrowserAgent schon verwendet?",
  pathDescription:
    "Wenn Sie es auf einem anderen Gerät nutzen, bringt die Synchronisierung Ihre KI-Anbieter, Agents und Chats hierher.",
  pathNew: "Zum ersten Mal hier",
  pathNewDescription:
    "Verbinden Sie einen KI-Anbieter und wählen Sie, was OpenBrowserAgent zu Webseiten hinzufügt.",
  pathReturning: "Ich nutze es auf einem anderen Gerät",
  pathReturningDescription:
    "Synchronisieren Sie Ihre Einstellungen, KI-Anbieter und Chats von Ihrem anderen Gerät.",
  syncTitle: "Art der Synchronisierung wählen",
  syncDescription:
    "Verbinden Sie sich auf dieselbe Weise wie auf Ihrem anderen Gerät.",
  recommended: "Empfohlen",
  methodCode: "Sync-Code einfügen",
  methodCodeDescription:
    "Ein Code enthält den Sync-Server und was synchronisiert wird.",
  methodBrowser: "Synchronisierung über das Browserkonto",
  browserConnect: "Synchronisierung über das Browserkonto einschalten",
  tryAgain: "Erneut versuchen",
  asNewUser: "Als neuer Nutzer einrichten",
  passphraseTitle: "Sync-Passphrase eingeben",
  passphraseDescription:
    "Ihre API-Schlüssel werden verschlüsselt synchronisiert. Geben Sie die Sync-Passphrase ein, die Sie auf Ihrem anderen Gerät festgelegt haben.",
  keysUnlocked: "Ihre API-Schlüssel sind entsperrt.",
  downloadTitle: "Verbinden und herunterladen",
  downloadDescription:
    "OpenBrowserAgent lädt herunter, was Ihr anderes Gerät synchronisiert hat.",
  downloading: "Wird heruntergeladen…",
  downloadFailed: "Download vom Sync-Server fehlgeschlagen.",
  arrived: "Von Ihrem anderen Gerät:",
  noSyncedProvider:
    "Von Ihrem anderen Gerät kam kein KI-Anbieter. Der Chat braucht einen.",
  arrivedCount: {
    providers: plural({
      one: "{count} KI-Anbieter",
      other: "{count} KI-Anbieter",
    }),
    agents: plural({ one: "{count} Agent", other: "{count} Agents" }),
    skills: plural({ one: "{count} Skill", other: "{count} Skills" }),
    mcpServers: plural({
      one: "{count} MCP-Server",
      other: "{count} MCP-Server",
    }),
    chats: plural({ one: "{count} Chat", other: "{count} Chats" }),
  },
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
    "Heften Sie OpenBrowserAgent im Erweiterungsmenü des Browsers an, klicken Sie auf das Symbol und wählen Sie „Seitenleiste öffnen“.",
  openPanel: "Seitenleiste öffnen",
  code: "Sync-Code",
  codeDescription:
    "Öffnen Sie auf Ihrem anderen Gerät {settings} → {sync} und klicken Sie auf „{button}“. Die Sync-Auswahl des Codes ersetzt die dieses Geräts.",
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
  unlocking: "Wird entsperrt…",
  skip: "Später",
};
