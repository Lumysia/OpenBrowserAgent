import type { SmartBarLocaleMessages } from "./en-US";

export const smartBarDeDE: SmartBarLocaleMessages = {
  barLabel: "Smart Bar",
  actions: {
    ask: "Fragen",
    explain: "Erklären",
    translate: "Übersetzen",
    summarize: "Zusammenfassen",
    copy: "Kopieren",
    improve: "Text verbessern",
    fixGrammar: "Rechtschreibung & Grammatik korrigieren",
  },
  copied: "Kopiert",
  closeMenu: "Smart-Bar-Optionen",
  hideOnSite: "Auf dieser Website ausblenden",
  turnOff: "Smart Bar ausschalten",
  close: "Schließen",
  stop: "Stoppen",
  retry: "Erneut versuchen",
  replace: "Ersetzen",
  insertBelow: "Darunter einfügen",
  continueInSidePanel: "In der Seitenleiste fortfahren",
  writing: "Wird geschrieben…",
  emptyResult: "Das Modell hat keinen Text geliefert.",
  selectionChanged:
    "Der markierte Text hat sich geändert. Kopieren Sie stattdessen das Ergebnis.",
  selectionTooLong: "Die Auswahl ist zu lang (über {max} Zeichen). Fahren Sie stattdessen im Seitenbereich fort.",
  settingsTitle: "Smart Bar",
  settingsDescription:
    "Eine kleine Leiste neben markiertem Text mit schnellen KI-Aktionen. Es wird nichts gesendet, bevor Sie eine Aktion wählen.",
  enable: "Smart Bar anzeigen",
  enableDescription:
    "Standardmäßig aus. Wenn aktiviert, reagiert OpenBrowserAgent auf erlaubten Seiten auf Textauswahl.",
  trigger: "Wann anzeigen",
  triggerDescription:
    "Das Tastenkürzel funktioniert in beiden Modi. Legen Sie es in den Erweiterungs-Tastenkürzeln Ihres Browsers fest.",
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
  model: "Smart-Bar-Modell",
  modelDescription:
    "Modell für Erklären, Übersetzen, Zusammenfassen und die Schreibaktionen.",
  modelSameAsAgent: "Wie Agent-Modell",
};
