import type { ContextMenuLocaleMessages } from "./en-US";

export const contextMenuDeDE: ContextMenuLocaleMessages = {
  items: {
    ask: "Zu dieser Seite fragen",
    askSelection: "Zu „%s“ fragen",
    summarizePage: "Diese Seite zusammenfassen",
    searchPage: "Im Web zu dieser Seite suchen",
    searchSelection: "Im Web nach „%s“ suchen",
    translateSelection: "„%s“ übersetzen",
    summarizeLink: "Verlinkte Seite zusammenfassen",
    copyMarkdown: "Als Markdown kopieren",
  },
  searchSelectionRequest: "Im Web zum ausgewählten Text suchen",
  copied: "Als Markdown kopiert",
  copyFailed:
    "Kopieren in die Zwischenablage fehlgeschlagen. Klicken Sie auf die Seite und versuchen Sie es erneut.",
  copyUnavailable:
    "Diese Seite kann nicht kopiert werden: Der Browser lässt Erweiterungen sie nicht lesen.",
  settingsTitle: "Kontextmenü",
  settingsDescription:
    "OpenBrowserAgent-Aktionen im Menü, das sich beim Rechtsklick auf eine Seite öffnet.",
  enable: "Im Kontextmenü anzeigen",
  enableDescription:
    "Zeigt beim Rechtsklick auf eine Seite, einen Link, ein Bild oder ausgewählten Text ein OpenBrowserAgent-Untermenü.",
  itemsTitle: "Menüeinträge",
  itemsDescription:
    "Aktionen, die die Seitenleiste öffnen, übergeben die Seite an Ihren Agent. „Als Markdown kopieren“ nutzt keine KI.",
  itemLabels: {
    ask: "Zu dieser Seite oder zum ausgewählten Text fragen",
    translateSelection:
      "Ausgewählten Text übersetzen (mit „Übersetzen“ der Smart Bar)",
    summarizePage: "Diese Seite zusammenfassen",
    searchWeb: "Im Web zu dieser Seite oder zum ausgewählten Text suchen",
    summarizeLink: "Verlinkte Seite zusammenfassen (auf Links)",
    copyMarkdown: "Als Markdown kopieren",
  },
};
