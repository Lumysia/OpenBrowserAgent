import type { PageTranslateLocaleMessages } from "./en-US";

export const pageTranslateFrFR: PageTranslateLocaleMessages = {
  menu: {
    translatePage: "Traduire cette page",
    showOriginal: "Afficher l’original",
  },
  menuItemLabel: "Traduire cette page / Afficher l’original",
  settingsTitle: "Traduction de page",
  settingsDescription:
    "Traduisez des pages entières depuis le menu contextuel : choisissez « Traduire cette page », puis « Afficher l’original » pour revenir.",
  engine: "Moteur de traduction",
  engineDescription:
    "La source des traductions. Les traductions sont enregistrées sur cet appareil : les pages déjà traduites s’affichent tout de suite.",
  engines: {
    model: "Modèle d’IA",
    browser: "Traducteur intégré (sur l’appareil)",
    google: "Google Traduction (gratuit)",
    microsoft: "Microsoft Translator (gratuit)",
  },
  engineDetails: {
    model:
      "Votre fournisseur d’IA configuré traduit, avec le modèle choisi ci-dessous.",
    browser:
      "Le navigateur traduit sur cet appareil ; aucun texte n’en sort. Chaque langue est téléchargée une seule fois.",
    google:
      "Un service gratuit non officiel, pas une API de Google. Il peut cesser de fonctionner à tout moment.",
    microsoft:
      "Un service gratuit non officiel, pas une API de Microsoft. Il peut cesser de fonctionner à tout moment.",
  },
  cloudNotice: {
    google: "Le texte de la page est envoyé à Google pour être traduit.",
    microsoft: "Le texte de la page est envoyé à Microsoft pour être traduit.",
  },
  privacyLink: "Politique de confidentialité",
  model: "Modèle",
  modelDescription: "Le modèle qui traduit les pages.",
  defaultModel: "Modèle sélectionné dans la discussion",
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
  cache: "Traductions enregistrées",
  cacheDescription:
    "Les traductions sont conservées 30 jours sur cet appareil : les pages traduites s’affichent tout de suite.",
  clearCache: "Effacer les traductions enregistrées",
  cacheCleared: "Traductions enregistrées effacées.",
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
  },
  noModel:
    "Aucun modèle d’IA n’est configuré. Ajoutez un fournisseur dans les paramètres.",
  browserUnsupported:
    "Le traducteur intégré ne peut pas traduire cette page en {language}.",
  unavailablePage:
    "Impossible de traduire cette page : le navigateur ne permet pas aux extensions de la modifier.",
};
