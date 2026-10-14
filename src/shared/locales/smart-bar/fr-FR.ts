import type { SmartBarLocaleMessages } from "./en-US";

export const smartBarFrFR: SmartBarLocaleMessages = {
  barLabel: "Barre intelligente",
  actions: {
    ask: "Demander dans le panneau latéral",
    explain: "Expliquer",
    translate: "Traduire",
    search: "Recherche IA",
    copy: "Copier",
    improve: "Améliorer le texte",
    fixGrammar: "Corriger l’orthographe et la grammaire",
  },
  copied: "Copié",
  closeMenu: "Options de la barre intelligente",
  hideOnSite: "Masquer sur {site}",
  turnOff: "Désactiver la barre intelligente",
  close: "Fermer",
  stop: "Arrêter",
  retry: "Réessayer",
  replace: "Remplacer",
  insertBelow: "Insérer en dessous",
  continueInSidePanel: "Continuer dans le panneau latéral",
  readSource: "Lire l’original à voix haute",
  readResult: "Lire le résultat à voix haute",
  stopReading: "Arrêter la lecture",
  noVoice: "Aucune voix installée pour : {language}.",
  writing: "Rédaction…",
  emptyResult: "Le modèle n’a renvoyé aucun texte.",
  connectionLost: "La connexion à OpenBrowserAgent a été perdue. Réessayez.",
  selectionChanged: "Le texte sélectionné a changé. Copiez plutôt le résultat.",
  selectionTooLong:
    "La sélection est trop longue (plus de {max} caractères). Continuez plutôt dans le panneau latéral.",
  dictionary: {
    pronunciation: "Prononciation",
    inContext: "Dans ce contexte",
    examples: "Exemples",
    synonyms: "Synonymes",
    collocations: "Collocations",
    entry: "Entrée de dictionnaire",
  },
  settingsTitle: "Barre intelligente",
  settingsDescription:
    "Des actions IA rapides près du texte sélectionné. Rien n’est envoyé avant que vous en choisissiez une.",
  enable: "Afficher la barre intelligente",
  enableDescription:
    "Désactivée par défaut. Une fois activée, OpenBrowserAgent surveille la sélection de texte sur les pages autorisées.",
  trigger: "Quand l’afficher",
  triggerDescription:
    "Le raccourci clavier fonctionne dans les deux modes. Définissez-le dans les paramètres des raccourcis d’extensions de votre navigateur.",
  triggerSelection: "À la sélection de texte",
  triggerShortcut: "Uniquement avec le raccourci",
  sites: "Sites",
  sitesDescription:
    "Les deux listes sont conservées ; le mode choisit celle qui s’applique. Un site inclut ses sous-domaines.",
  siteModeBlockList: "Partout sauf les sites bloqués",
  siteModeAllowList: "Uniquement sur les sites autorisés",
  blockedSites: "Sites bloqués",
  allowedSites: "Sites autorisés",
  sitePlaceholder: "example.com",
  addSite: "Ajouter un site",
  removeSite: "Retirer {host}",
  invalidSite: "Saisissez un site comme example.com.",
  noSites: "Aucun site pour l’instant.",
  pageActions: "Actions pour le texte de la page",
  pageActionsDescription:
    "Affichées lorsque vous sélectionnez du texte sur une page.",
  editActions: "Actions pour le texte en cours de saisie",
  editActionsDescription:
    "Affichées lorsque vous sélectionnez du texte dans un champ. Le résultat peut remplacer la sélection.",
  model: "Modèle de la barre intelligente",
  modelDescription:
    "Modèle pour Expliquer, Traduire et les actions d’écriture.",
};
