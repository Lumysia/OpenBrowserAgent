import type { PageTranslateLocaleMessages } from "./en-US";

export const pageTranslateFrFR: PageTranslateLocaleMessages = {
  menu: {
    translatePage: "Traduire cette page",
    showOriginal: "Afficher l’original",
  },
  menuItemLabel: "Traduire cette page / Afficher l’original",
  settingsTitle: "Traduction de page",
  settingsDescription:
    "Choisissez « Traduire cette page » dans le menu contextuel pour traduire une page, et « Afficher l’original » pour revenir au texte d’origine.",
  engine: "Moteur de traduction",
  engineDescription: "Choisissez ce qui traduit les pages.",
  engines: {
    model: "Modèle d’IA",
    browser: "Traducteur intégré (sur l’appareil)",
    google: "Google Traduction (gratuit)",
    microsoft: "Microsoft Translator (gratuit)",
  },
  engineDetails: {
    model:
      "Votre fournisseur d’IA traduit les pages avec le modèle choisi ci-dessous.",
    browser:
      "Le navigateur traduit sur cet appareil ; aucun texte n’en sort. Chaque langue est téléchargée une seule fois.",
    google:
      "Un service gratuit non officiel, pas une API de Google. Il peut cesser de fonctionner à tout moment.",
    microsoft:
      "Un service gratuit non officiel, pas une API de Microsoft. Il peut cesser de fonctionner à tout moment.",
  },
  cloudNotice: {
    google:
      "Le texte de la page est envoyé à Google pour être traduit. Si Google échoue sur une page, Microsoft traduit le reste de la page.",
    microsoft:
      "Le texte de la page est envoyé à Microsoft pour être traduit. Si Microsoft échoue sur une page, Google traduit le reste de la page.",
  },
  freeServices: {
    google: "Google",
    microsoft: "Microsoft",
  },
  privacyLink: "Politique de confidentialité",
  model: "Modèle",
  modelDescription: "Le modèle qui traduit les pages.",
  defaultModel: "Même modèle que la discussion",
  targetLanguage: "Traduire en",
  targetLanguageDescription:
    "Les pages sont traduites dans cette langue. La langue de l’extension ne change pas.",
  followInterface: "Langue de l’extension ({language})",
  display: "Affichage",
  displayDescription:
    "« Original et traduction » garde chaque paragraphe et ajoute la traduction en dessous.",
  displayModes: {
    bilingual: "Original et traduction",
    translation: "Traduction seule",
  },
  translateMenus: "Traduire aussi les menus et les boutons",
  translateMenusDescription:
    "Désactivé, seul le contenu principal de la page est traduit ; la navigation, les menus, les boutons, les onglets et les pieds de page restent tels quels.",
  cache: "Traductions enregistrées",
  cacheDescription:
    "Les traductions sont conservées 30 jours sur cet appareil : les pages traduites s’affichent tout de suite.",
  clearCache: "Effacer les traductions enregistrées",
  cacheCleared: "Traductions enregistrées effacées.",
  clearCacheFailed: "Impossible d’effacer les traductions enregistrées",
  errors: {
    unavailable:
      "{engine} n’est pas disponible. Vérifiez la traduction de page dans les paramètres.",
    rateLimited:
      "{engine} limite les requêtes de ce réseau. Réessayez plus tard ou choisissez un autre moteur dans les paramètres.",
    refused:
      "{engine} a refusé de traduire. Choisissez un autre moteur dans les paramètres.",
    network:
      "Impossible de joindre {engine}. Vérifiez votre connexion et réessayez.",
    failed: "{engine} n’a pas pu traduire certains paragraphes.",
    allFailed:
      "Ni {engine} ni {fallback} n’ont pu traduire. Réessayez plus tard ou choisissez un autre moteur dans les paramètres.",
  },
  switched: {
    rateLimited:
      "{engine} limite les requêtes ; cette page passe à {fallback}.",
    failed:
      "{engine} ne fonctionne pas pour le moment ; cette page passe à {fallback}.",
  },
  browserUnsupported:
    "Le traducteur intégré ne peut pas traduire cette page en {language}.",
  notStarted:
    "Impossible de lancer la traduction de cette page. Rechargez la page et réessayez.",
  unavailablePage:
    "Impossible de traduire cette page : le navigateur ne permet pas aux extensions de la modifier.",
};
