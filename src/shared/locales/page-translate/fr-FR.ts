import type { PageTranslateLocaleMessages } from "./en-US";

export const pageTranslateFrFR: PageTranslateLocaleMessages = {
  menu: {
    translatePage: "Traduire cette page",
    showOriginal: "Afficher l’original",
  },
  menuItemLabel: "Traduire cette page / Afficher l’original",
  settingsTitle: "Traduction de page",
  settingsDescription:
    "Traduisez une page avec le bouton sur son bord, le raccourci clavier ou « Traduire cette page » dans le menu contextuel. Recommencez pour revenir à l’original.",
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
      "Votre fournisseur d’IA traduit les pages avec le modèle de traduction choisi dans Fournisseurs d’IA et modèles.",
    browser:
      "Le navigateur traduit sur cet appareil ; aucun texte n’en sort. Chaque langue est téléchargée une seule fois. Lorsqu’il ne peut pas traduire une page, le modèle d’IA choisi ci-dessous prend le relais.",
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
  engineNames: {
    model: "le modèle d’IA",
    browser: "le traducteur intégré",
    google: "Google",
    microsoft: "Microsoft",
  },
  privacyLink: "Politique de confidentialité",
  modelDescription: "Le modèle qui traduit les pages.",
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
    "Désactivé, les libellés courts de la navigation, des menus, des boutons, des onglets et des pieds de page restent tels quels ; les titres, les phrases et les questions qu’ils contiennent sont quand même traduits.",
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
      "Pour cette page, {fallback} prend le relais : {engine} limite les requêtes.",
    failed:
      "Pour cette page, {fallback} prend le relais : {engine} ne fonctionne pas pour le moment.",
    unavailable:
      "Pour cette page, {fallback} prend le relais : {engine} ne peut pas la traduire ici.",
  },
  browserMissing:
    "Ce navigateur n’a pas de traducteur intégré : le modèle d’IA choisi ci-dessous traduit donc les pages.",
  notStarted:
    "Impossible de lancer la traduction de cette page. Rechargez la page et réessayez.",
  unavailablePage:
    "Impossible de traduire cette page : le navigateur ne permet pas aux extensions de la modifier.",
  button: {
    translating: "Traduction…",
    hide: "Masquer le bouton de traduction",
    hideOnSite: "Masquer sur {site}",
    hideEverywhere: "Masquer partout",
    setting: "Bouton de traduction sur les pages",
    settingDescription:
      "Un petit bouton sur le bord des pages web traduit la page ou affiche l’original. Faites-le glisser pour le déplacer ; il reste sur le bord le plus proche de la fenêtre.",
    move: "Les flèches le déplacent le long du bord ; E le place sur le bord suivant.",
    hiddenSites: "Masqué sur ces sites",
    hiddenSitesDescription:
      "Le bouton n’apparaît pas sur ces sites. Un site inclut ses sous-domaines.",
  },
  subtitles: {
    menu: "Traduire les sous-titres",
    menuItemLabel: "Traduire les sous-titres / Les masquer (sur les vidéos)",
    noCaptions:
      "Aucun sous-titre trouvé pour cette vidéo pour l’instant. Activez les sous-titres dans le lecteur : ils sont traduits dès qu’ils s’affichent.",
    liveOnly:
      "Les sous-titres affichés sont traduits au fur et à mesure. Pour les traduire à l’avance, désactivez puis réactivez les sous-titres du lecteur.",
    noVideo: "Aucune vidéo dont traduire les sous-titres ici.",
    // Settings: subtitles start by themselves on every video.
    setting: "Traduire les sous-titres des vidéos",
    settingDescription:
      "Les vidéos avec sous-titres affichent d’elles-mêmes chaque ligne avec sa traduction en dessous, sur tous les sites. « Traduire les sous-titres » dans le menu contextuel d’une vidéo les désactive ou les réactive pour cette vidéo. Quand cette option est désactivée, le menu et « Traduire cette page » les traduisent toujours.",
  },
};
