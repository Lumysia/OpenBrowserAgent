import type { SettingsMessages } from "./en-US";

export const settingsFrFR: SettingsMessages = {
  providersModels: "Fournisseurs d’IA et modèles",
  agentsSkills: "Agents et compétences",
  onPages: "Sur les pages",
  advanced: "Avancé",
  translate: "Traduire",
  rightClick: "Menu contextuel",
  troubleshooting: "Dépannage",
  shortcuts: "Raccourcis clavier",
  shortcutsDescription:
    "Raccourcis des commandes d’OpenBrowserAgent. Le navigateur les gère ; modifiez-les dans ses paramètres de raccourcis.",
  shortcutNone: "Non défini",
  changeShortcuts: "Modifier les raccourcis",
  shortcutsFirefoxHint:
    "Pour les modifier, ouvrez about:addons, cliquez sur la roue dentée et choisissez « Gérer les raccourcis d’extension ».",
  openSidePanelCommand: "Ouvrir le panneau latéral",
  smartBarCommand: "Afficher la barre intelligente pour le texte sélectionné",
  translatePageCommand: "Traduire cette page ou afficher l’original",
  sidePanelShortcutHint:
    "Choisissez une touche dans les paramètres de raccourcis du navigateur, par exemple {keys}.",
  // One command's keys, with a button to change them.
  commandShortcut: {
    // {shortcut}: the keys, as the browser shows them.
    current: "Raccourci : {shortcut}",
    none: "Aucun raccourci défini",
    change: "Modifier le raccourci",
  },
  chatBehavior: "Comportement des discussions",
  chatBehaviorDescription:
    "Défilement, nouvelles tentatives, étapes d’outils et touches festives dans le panneau latéral.",
  models: "Modèles",
  modelsDescription:
    "Le modèle utilisé par chaque fonction. Chacune utilise le modèle de discussion, sauf si vous en choisissez un autre.",
  modelChat: "Discussion",
  modelHelper: "Auxiliaire",
  modelSmartBar: "Barre intelligente",
  modelTranslation: "Traduction",
  modelImages: "Images",
  translateMenuItems: "Entrées du menu contextuel",
  translateMenuItemsDescription:
    "Les entrées de traduction du menu contextuel. Le menu lui-même s’active ou se désactive dans Menu contextuel.",
};
