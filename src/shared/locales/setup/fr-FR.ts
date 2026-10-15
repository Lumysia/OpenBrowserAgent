import type { SetupMessages } from "./en-US";

export const setupFrFR: SetupMessages = {
  title: "Configurer OpenBrowserAgent",
  description: "Ajoutez un fournisseur d’IA pour commencer à discuter.",
  continueSetup: "Continuer la configuration",
  openedSettings:
    "La configuration est ouverte dans un autre onglet. Revenez ici quand vous avez terminé.",
  runAgain: "Relancer la configuration",
  progressLabel: "Étapes de configuration",
  progressStep: "Étape {current} sur {total} : {step}",
  steps: {
    language: "Langue",
    provider: "Fournisseur d’IA",
    pages: "Sur les pages",
    done: "Terminé",
  },
  back: "Retour",
  next: "Suivant",
  skipStep: "Passer",
  languageTitle: "Choisissez vos langues",
  languageDescription:
    "La langue de l’extension et celle dans laquelle les pages sont traduites. La plupart des gens gardent les deux telles quelles.",
  providerTitle: "Connecter un fournisseur d’IA",
  providerDescription:
    "Les discussions et l’agent ont besoin d’un fournisseur d’IA. Choisissez un service, ou n’importe quel serveur compatible OpenAI ou Anthropic avec son Base URL.",
  providerPlaceholder: "Choisir un fournisseur d’IA",
  providerReady: "{name} est prêt. Appuyez sur « Suivant » pour continuer.",
  testConnection: "Tester la connexion",
  testingConnection: "Test en cours…",
  connectionOk: "Connecté. {model} a répondu.",
  connectionFailed: "Impossible de se connecter au fournisseur d’IA",
  modelFailed: "Connecté, mais {model} n’a pas répondu",
  noModelsListed:
    "Connecté, mais le fournisseur d’IA n’a listé aucun modèle. Saisissez le nom d’un modèle.",
  model: "Modèle",
  modelName: "Nom du modèle",
  modelNameHint:
    "Si le fournisseur d’IA ne liste pas ses modèles, saisissez-en un par son nom, puis testez à nouveau.",
  pagesTitle: "Sur les pages",
  pagesDescription:
    "Ce qu’OpenBrowserAgent ajoute aux pages que vous visitez. Vous pourrez le modifier plus tard dans Paramètres → Sur les pages.",
  translateButtonDescription:
    "Un petit bouton au bord de la page la traduit ou affiche l’original.",
  smartBarTitle: "Barre intelligente sur le texte sélectionné",
  smartBarDescription:
    "Des actions rapides à côté du texte sélectionné. Rien n’est envoyé avant que vous en choisissiez une.",
  subtitlesDescription:
    "Les vidéos avec sous-titres affichent chaque ligne avec sa traduction en dessous.",
  doneTitle: "Tout est prêt",
  doneDescription:
    "Ouvrez le panneau latéral et posez une question sur la page affichée. Ces raccourcis fonctionnent sur toutes les pages.",
  noProviderNote:
    "Les discussions ont besoin d’un fournisseur d’IA. La traduction des pages avec le traducteur intégré fonctionne sans.",
  welcomeTitle: "Bienvenue dans OpenBrowserAgent",
  openPanelDescription:
    "Épinglez OpenBrowserAgent depuis le menu Extensions du navigateur, puis cliquez sur son icône pour ouvrir le panneau latéral.",
  openPanel: "Ouvrir le panneau latéral",
  joinLink:
    "Vous utilisez déjà OpenBrowserAgent sur un autre appareil ? Collez un code de synchronisation",
  codeTab: "Coller un code",
  manualTab: "Configuration manuelle",
  code: "Code de synchronisation",
  codeDescription:
    "Copiez-le sur l’autre appareil dans Paramètres → Synchronisation. Les choix de synchronisation du code remplacent ceux de cet appareil.",
  codeInvalid:
    "Ce n’est pas un code de synchronisation valide. Copiez-le à nouveau et collez le code entier.",
  connect: "Connecter et synchroniser",
  testing: "Connexion…",
  pulling: "Synchronisation…",
  failed:
    "Connexion impossible. Vérifiez le code ou les informations du serveur, puis réessayez.",
  connected: "Connecté. Vos paramètres se synchronisent.",
  keysLocked:
    "Vos clés API sont synchronisées mais verrouillées. Saisissez votre phrase secrète de synchronisation.",
  unlock: "Déverrouiller",
  skip: "Plus tard",
};
