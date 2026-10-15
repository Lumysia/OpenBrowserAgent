import type { ContextMenuLocaleMessages } from "./en-US";

export const contextMenuFrFR: ContextMenuLocaleMessages = {
  items: {
    ask: "Poser une question sur cette page",
    askSelection: "Poser une question sur « %s »",
    summarizePage: "Résumer cette page",
    searchPage: "Rechercher sur le web à propos de cette page",
    searchSelection: "Rechercher « %s » sur le web",
    translateSelection: "Traduire « %s »",
    summarizeLink: "Résumer la page liée",
    copyMarkdown: "Copier en Markdown",
  },
  searchSelectionRequest: "Rechercher sur le web à propos du texte sélectionné",
  copied: "Copié en Markdown",
  copyFailed:
    "Impossible de copier dans le presse-papiers. Cliquez sur la page et réessayez.",
  copyUnavailable:
    "Impossible de copier cette page : le navigateur ne permet pas aux extensions de la lire.",
  settingsTitle: "Menu contextuel",
  settingsDescription:
    "Les actions OpenBrowserAgent du menu qui s’ouvre quand vous faites un clic droit sur une page.",
  enable: "Afficher dans le menu contextuel",
  enableDescription:
    "Ajoute un sous-menu OpenBrowserAgent quand vous faites un clic droit sur une page, un lien, une image ou du texte sélectionné.",
  itemsTitle: "Éléments du menu",
  itemsDescription:
    "Les actions qui ouvrent le panneau latéral transmettent la page à votre agent. Copier en Markdown n’utilise pas l’IA.",
  itemLabels: {
    ask: "Poser une question sur cette page ou le texte sélectionné",
    translateSelection:
      "Traduire le texte sélectionné (avec « Traduire » de la barre intelligente)",
    summarizePage: "Résumer cette page",
    searchWeb:
      "Rechercher sur le web à propos de cette page ou du texte sélectionné",
    summarizeLink: "Résumer la page liée (sur les liens)",
    copyMarkdown: "Copier en Markdown",
  },
};
