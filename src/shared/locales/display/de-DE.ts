import { plural } from "../../plural";
import type { DisplayMessages } from "./en-US";

export const displayDeDE: DisplayMessages = {
  counts: {
    models: plural({ one: "{count} Modell", other: "{count} Modelle" }),
    files: plural({ one: "{count} Datei", other: "{count} Dateien" }),
    characters: plural({ one: "{count} Zeichen", other: "{count} Zeichen" }),
  },
  providerTypes: {
    openai: "OpenAI (oder kompatibel)",
    "openai-responses": "OpenAI (Responses-API)",
    anthropic: "Anthropic (oder kompatibel)",
    gemini: "Google Gemini",
    ollama: "Ollama (lokal)",
  },
  mcpServerPresets: {
    exa: "Websuche und Extraktion von Webseiteninhalten.",
    parallel: "Websuche mit Auszügen und Abruf von Webseiten.",
    tinyfish: "Web- und Nachrichtensuche.",
    firecrawl:
      "Websuche, Auslesen von Webseiten und Dokumentanalyse. Niedriges kostenloses Anfragelimit.",
  },
  builtinSkills: {
    "fill-form": {
      name: "Formular ausfüllen",
      description:
        "Füllt Webformulare mit Ihren Angaben oder aus einer Datei aus, prüft jedes Feld und sendet nur ab, wenn Sie es sagen.",
    },
    "tidy-tabs": {
      name: "Tabs aufräumen",
      description:
        "Schließt doppelte Tabs, gruppiert zusammengehörige und findet Tabs, die Sie nicht mehr brauchen.",
    },
    "openbrowseragent-help": {
      name: "OpenBrowserAgent-Hilfe",
      description:
        "Beantwortet Fragen zur Nutzung und Einrichtung von OpenBrowserAgent.",
    },
    "skill-creator": {
      name: "Skill-Ersteller",
      description:
        "Erstellt, speichert oder verbessert Skills, zum Beispiel aus einer Aufgabe, die Sie gerade erledigt haben.",
    },
    "local-execution-bridge-setup": {
      name: "Lokale Ausführungs-Bridge einrichten",
      description:
        "Richtet eine lokale Ausführungs-Bridge ein, testet, aktualisiert oder entfernt sie, damit Agenten Befehle auf Ihrem Computer ausführen können.",
    },
  },
  errors: {
    noModel:
      "Es ist kein Modell eingerichtet. Fügen Sie unter „Einstellungen“ → „KI-Anbieter“ einen Anbieter hinzu.",
    noImageModel:
      "Es ist kein Bildmodell eingerichtet. Wählen Sie unter „Einstellungen“ → „KI-Anbieter“ eines aus.",
    baseUrlRequired: "Geben Sie eine Basis-URL ein.",
    bridgeNotFound: "Diese Ausführungs-Bridge gibt es nicht mehr.",
    bridgeHostRequired: "Geben Sie den Namen des Native-Messaging-Hosts ein.",
    bridgeTimeout: "Die Ausführungs-Bridge hat nicht rechtzeitig geantwortet.",
    syncKeysLocked:
      "Ihre API-Schlüssel sind synchronisiert, aber gesperrt. Geben Sie Ihre Sync-Passphrase unter Einstellungen → Synchronisierung ein.",
    teachUnscriptable: "Diese Seite kann nicht aufgezeichnet werden.",
    tabRecording:
      "Dieser Tab wird gerade aufgezeichnet. Beenden Sie die Aufzeichnung, bevor der Agent darin arbeitet.",
    teachEmpty:
      "Es wurde nichts aufgezeichnet. Erledigen Sie die Aufgabe auf der Seite und beenden Sie dann die Aufzeichnung.",
    teachNoInstructions:
      "Das Modell hat keine Anweisungen geschrieben. Versuchen Sie es erneut.",
    teachGone: "Diese Aufzeichnung gibt es nicht mehr.",
    teachCheckTab: "Der Tab für die Prüfung konnte nicht geöffnet werden.",
    teachBusy:
      "Eine andere Aufzeichnung ist noch offen. Speichern oder verwerfen Sie sie zuerst.",
    teachTabBusy:
      "Der Agent arbeitet in diesem Tab. Warten Sie, bis er fertig ist, und zeichnen Sie dann auf.",
  },
  toolSteps: {
    failed: "Fehlgeschlagen",
    page: "Seite",
    tabs: plural({ one: "{count} Tab", other: "{count} Tabs" }),
    lines: plural({ one: "{count} Zeile", other: "{count} Zeilen" }),
    matchingLines: plural({
      one: "{count} passende Zeile",
      other: "{count} passende Zeilen",
    }),
    matchingLinesWithOccurrences: plural({
      one: "{count} passende Zeile ({occurrences})",
      other: "{count} passende Zeilen ({occurrences})",
    }),
    occurrences: plural({
      one: "{count} Vorkommen",
      other: "{count} Vorkommen",
    }),
    results: plural({ one: "{count} Ergebnis", other: "{count} Ergebnisse" }),
    items: plural({ one: "{count} Eintrag", other: "{count} Einträge" }),
    tools: plural({ one: "{count} Tool", other: "{count} Tools" }),
    filesSaved: plural({
      one: "{count} Datei gespeichert",
      other: "{count} Dateien gespeichert",
    }),
    editsApplied: plural({
      one: "{applied} von {count} Änderung übernommen",
      other: "{applied} von {count} Änderungen übernommen",
    }),
    actions: {
      open: "Geöffnet",
      switch: "Gewechselt zu",
      close: "Geschlossen",
      navigate: "Aufgerufen",
      back: "Zurückgegangen",
      forward: "Vorwärtsgegangen",
      reload: "Neu geladen",
      group: "Gruppiert",
      ungroup: "Gruppierung aufgehoben",
      list: "Aufgelistet",
      search: "Gesucht",
      read: "Gelesen",
      write: "Geschrieben",
      append: "Angehängt",
      replace: "Text ersetzt",
      delete: "Gelöscht",
      create: "Erstellt",
      patch: "Bearbeitet",
      add: "Hinzugefügt",
      update: "Aktualisiert",
      test: "Getestet",
      status: "Status abgefragt",
      resources: "Netzwerkressourcen aufgelistet",
      emulate: "Gerät emuliert",
      reset: "Emulation zurückgesetzt",
      capture: "Aufzeichnung gestartet",
      captured: "Aufzeichnung gelesen",
      request: "Anfrage gelesen",
      download: "Heruntergeladen",
      save: "Gespeichert",
      wait: "Auf Download gewartet",
      retry: "Erneut versucht",
      images: "Bilder gespeichert",
      run: "Ausgeführt",
      start: "Gestartet",
      cancel: "Abgebrochen",
      get: "Abgerufen",
      runNow: "Lauf gestartet",
      pause: "Pausiert",
      resume: "Fortgesetzt",
    },
    commandStates: {
      running: "Läuft",
      done: "Fertig",
      error: "Fehlgeschlagen",
      canceled: "Abgebrochen",
      missing: "Aufgabe nicht gefunden",
    },
    actStepSeparator: ", ",
    actSteps: {
      click: plural({
        one: "{count} Element angeklickt",
        other: "{count} Elemente angeklickt",
      }),
      type: plural({
        one: "{count} Feld ausgefüllt",
        other: "{count} Felder ausgefüllt",
      }),
      press: plural({
        one: "{count} Taste gedrückt",
        other: "{count} Tasten gedrückt",
      }),
      select: plural({
        one: "{count} Option ausgewählt",
        other: "{count} Optionen ausgewählt",
      }),
      hover: plural({
        one: "auf {count} Element gezeigt",
        other: "auf {count} Elemente gezeigt",
      }),
      scroll: plural({
        one: "{count}-mal gescrollt",
        other: "{count}-mal gescrollt",
      }),
      wait: plural({
        one: "{count}-mal gewartet",
        other: "{count}-mal gewartet",
      }),
      drag: plural({
        one: "{count} Element gezogen",
        other: "{count} Elemente gezogen",
      }),
      dialog: plural({
        one: "{count} Dialog beantwortet",
        other: "{count} Dialoge beantwortet",
      }),
      other: plural({
        one: "{count} weiteren Schritt ausgeführt",
        other: "{count} weitere Schritte ausgeführt",
      }),
    },
  },
};
