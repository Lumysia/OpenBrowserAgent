import type { SettingsMessages } from "./en-US";

export const settingsDeDE: SettingsMessages = {
  providersModels: "KI-Anbieter und Modelle",
  agentsSkills: "Agents und Skills",
  onPages: "Auf Webseiten",
  advanced: "Erweitert",
  translate: "Übersetzen",
  rightClick: "Kontextmenü",
  troubleshooting: "Fehlerbehebung",
  shortcuts: "Tastenkürzel",
  shortcutsDescription:
    "Tastenkürzel für die Befehle von OpenBrowserAgent. Der Browser verwaltet sie; ändern Sie sie in seinen Tastenkürzel-Einstellungen.",
  shortcutNone: "Nicht festgelegt",
  changeShortcuts: "Tastenkürzel ändern",
  shortcutsFirefoxHint:
    "Öffnen Sie dazu about:addons, klicken Sie auf das Zahnrad und wählen Sie „Tastenkombinationen für Erweiterungen verwalten“.",
  openMenuCommand: "Menü öffnen",
  openSidePanelCommand: "Seitenleiste öffnen",
  smartBarCommand: "Smart Bar für den markierten Text anzeigen",
  translatePageCommand: "Diese Seite übersetzen oder das Original anzeigen",
  sidePanelShortcutHint:
    "Wählen Sie eine Taste in den Tastenkürzel-Einstellungen des Browsers, zum Beispiel {keys}.",
  // One command's keys, with a button to change them.
  commandShortcut: {
    // {shortcut}: the keys, as the browser shows them.
    current: "Tastenkombination: {shortcut}",
    none: "Keine Tastenkombination festgelegt",
    change: "Tastenkombination ändern",
  },
  chatBehavior: "Chatverhalten",
  chatBehaviorDescription:
    "Scrollen, Wiederholungen, Tool-Schritte und Feiertagsdeko in der Seitenleiste.",
  models: "Modelle",
  modelsDescription:
    "Welches Modell jede Funktion nutzt. Ohne andere Auswahl nutzt jede das Chatmodell.",
  modelChat: "Chat",
  modelHelper: "Hilfsmodell",
  modelSmartBar: "Smart Bar",
  modelTranslation: "Übersetzung",
  modelTranslationUnavailable:
    "Die Seitenübersetzung verwendet {engine}, kein KI-Modell. Den Übersetzungsdienst ändern Sie in den Einstellungen unter „Seitenübersetzung“.",
  modelImages: "Bilder",
  translateMenuItems: "Einträge im Kontextmenü",
  translateMenuItemsDescription:
    "Übersetzungseinträge im Kontextmenü. Das Menü selbst schalten Sie unter Kontextmenü ein oder aus.",
};
