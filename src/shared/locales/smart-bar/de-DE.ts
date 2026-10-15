import type { SmartBarLocaleMessages } from "./en-US";

export const smartBarDeDE: SmartBarLocaleMessages = {
  barLabel: "Smart Bar",
  actions: {
    ask: "In der Seitenleiste fragen",
    explain: "Erklären",
    translate: "Übersetzen",
    search: "KI-Suche",
    copy: "Kopieren",
    improve: "Text verbessern",
    fixGrammar: "Rechtschreibung & Grammatik korrigieren",
  },
  copied: "Kopiert",
  closeMenu: "Smart-Bar-Optionen",
  hideOnSite: "Auf {site} ausblenden",
  turnOff: "Smart Bar ausschalten",
  close: "Schließen",
  stop: "Stoppen",
  retry: "Erneut versuchen",
  replace: "Ersetzen",
  insertBelow: "Darunter einfügen",
  continueInSidePanel: "In der Seitenleiste fortfahren",
  readSource: "Original vorlesen",
  readResult: "Ergebnis vorlesen",
  stopReading: "Vorlesen beenden",
  noVoice: "Keine Stimme für {language} installiert.",
  writing: "Wird geschrieben…",
  thinking: "Denkt nach…",
  emptyResult: "Das Modell hat keinen Text geliefert.",
  connectionLost:
    "Die Verbindung zu OpenBrowserAgent wurde unterbrochen. Versuchen Sie es erneut.",
  selectionChanged:
    "Der markierte Text hat sich geändert. Kopieren Sie stattdessen das Ergebnis.",
  selectionTooLong:
    "Die Auswahl ist zu lang (über {max} Zeichen). Fahren Sie stattdessen in der Seitenleiste fort.",
  dictionary: {
    pronunciation: "Aussprache",
    inContext: "In diesem Kontext",
    examples: "Beispiele",
    synonyms: "Synonyme",
    collocations: "Kollokationen",
    entry: "Wörterbucheintrag",
  },
  settingsTitle: "Smart Bar",
  settingsDescription:
    "Schnelle KI-Aktionen neben markiertem Text. Es wird nichts gesendet, bevor Sie eine wählen.",
  enable: "Smart Bar anzeigen",
  enableDescription:
    "Standardmäßig aus. Wenn aktiviert, beobachtet OpenBrowserAgent auf erlaubten Seiten, welcher Text markiert wird.",
  trigger: "Wann anzeigen",
  triggerDescription:
    "Das Tastenkürzel funktioniert in beiden Modi. Legen Sie es in den Tastenkürzel-Einstellungen für Erweiterungen Ihres Browsers fest.",
  triggerSelection: "Beim Markieren von Text",
  triggerShortcut: "Nur per Tastenkürzel",
  sites: "Websites",
  sitesDescription:
    "Beide Listen bleiben erhalten; der Modus bestimmt, welche gilt. Eine Website schließt ihre Subdomains ein.",
  siteModeBlockList: "Überall außer auf gesperrten Websites",
  siteModeAllowList: "Nur auf erlaubten Websites",
  blockedSites: "Gesperrte Websites",
  allowedSites: "Erlaubte Websites",
  sitePlaceholder: "example.com",
  addSite: "Website hinzufügen",
  removeSite: "{host} entfernen",
  invalidSite: "Geben Sie eine Website wie example.com ein.",
  noSites: "Noch keine Websites.",
  pageActions: "Aktionen für Seitentext",
  pageActionsDescription:
    "Werden angezeigt, wenn Sie Text auf einer Seite markieren.",
  editActions: "Aktionen für Text, den Sie bearbeiten",
  editActionsDescription:
    "Werden angezeigt, wenn Sie Text in einem Eingabefeld markieren. Das Ergebnis kann die Auswahl ersetzen.",
  modelDescription: "Modell für Erklären, Übersetzen und die Schreibaktionen.",
};
